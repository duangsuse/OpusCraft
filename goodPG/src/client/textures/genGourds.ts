// Generadores de calabazas y sandías (fruto, tallos por edad y tallo unido, calabaza tallada y farol)
// y del compostador (tablas, marco, compost y compost listo).
//
// Los tallos son recortes anclados abajo: la altura visible crece con la edad y el color pasa de
// verde a ocre al madurar, como en Minecraft.

import { Tex, N, clamp, mix, scale, pixelNoise, Noise, type Generator, type RGB } from './texCore';
import { cutoutCanvas } from './genPlants';
import { pumpkinSide } from './genMisc';
import { planks, OAK_PLANKS } from './genWood';

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < 16 && y < 16;
}

// ---------------------------------------------------------------------------
// Sandía
// ---------------------------------------------------------------------------

const MELON_DARK: RGB = [58, 104, 24];
const MELON_BASE: RGB = [104, 150, 34];
const MELON_LIGHT: RGB = [148, 186, 58];

/** Lateral: franjas verticales oscuras algo onduladas sobre verde claro, con motas. */
function melonSide(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const wob = new Noise(r, 4, 8);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const xs = x + Math.round((wob.at(x, y) - 0.5) * 2);
    const band = ((xs % 4) + 4) % 4;
    const stripe = band === 0 || (band === 1 && px[i] > 0.55);
    let c = stripe ? MELON_DARK : mix(MELON_BASE, MELON_LIGHT, px[i] * 0.6);
    if (!stripe && px[i] > 0.93) c = MELON_LIGHT;
    t.setI(i, c);
    t.height[i] = stripe ? 0.6 : 0.85 + 0.15 * px[i];
    t.smooth[i] = 110;
  }
  t.depth = 0.8;
}

/** Tapa: anillos concéntricos con franjas radiales y el rabito seco en el centro. */
function melonTop(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const dx = x - 7.5, dy = y - 7.5;
    const rr = Math.hypot(dx, dy);
    const ray = Math.abs(Math.sin(4 * Math.atan2(dy, dx)));
    const stripe = ray > 0.86 && rr > 2.5;
    let c = stripe ? MELON_DARK : mix(MELON_BASE, MELON_LIGHT, clamp(0.7 - rr / 12 + px[i] * 0.3, 0, 1));
    if (rr < 1.6) c = [112, 96, 40];
    t.setI(i, c);
    t.height[i] = stripe ? 0.6 : 0.9;
    t.smooth[i] = rr < 1.6 ? 40 : 110;
  }
}

// ---------------------------------------------------------------------------
// Tallos
// ---------------------------------------------------------------------------

/** Color del tallo según la edad (verde → ocre). */
function stemColor(age: number): RGB {
  return mix([74, 150, 44], [186, 160, 50], age / 7);
}

/** Tallo en crecimiento: sube (2·edad + 2) píxeles con hojitas alternas. */
function stem(age: number): Generator {
  return (t) => {
    cutoutCanvas(t, 55, 210);
    const c = stemColor(age);
    const top = 16 - (age * 2 + 2);
    for (let y = 15; y >= top; y--) {
      const x = 7 + (((15 - y) >> 2) & 1);
      const p = (15 - y) / 15;
      t.paint(x, y, mix(scale(c, 0.78), c, p), 0.6 + 0.4 * p, 50, 200);
      // Hojitas a los lados cada tres filas.
      if ((15 - y) % 3 === 2 && y > top) {
        const side = ((15 - y) / 3) & 1 ? 1 : -1;
        if (inBounds(x + side, y)) t.paint(x + side, y, scale(c, 1.08), 0.8, 50, 220);
        if (inBounds(x + side * 2, y - 1)) t.paint(x + side * 2, y - 1, scale(c, 0.95), 0.8, 50, 220);
      }
    }
  };
}

/** Tallo unido al fruto: sube por el centro y se dobla hacia la derecha (donde está el fruto). */
function stemAttached(t: Tex): void {
  cutoutCanvas(t, 55, 210);
  const c = stemColor(7);
  const pts: [number, number][] = [];
  for (let y = 15; y >= 9; y--) pts.push([8, y]);
  pts.push([9, 8], [10, 8], [11, 7], [12, 7], [13, 6], [14, 6], [15, 6]);
  pts.forEach(([x, y], k) => {
    const p = k / (pts.length - 1);
    t.paint(x, y, mix(scale(c, 0.8), scale(c, 0.92), p), 0.7 + 0.3 * p, 50, 200);
  });
  // El plano baja 1/16 dentro de la tierra de cultivo y ahí repite la fila 0: el arranque del tallo.
  t.paint(8, 0, scale(c, 0.8), 0.7, 50, 200);
  // Hojas en el codo y a mitad del tallo.
  for (const [x, y] of [[7, 12], [6, 11], [9, 10], [10, 9], [11, 6], [12, 5]] as const) t.paint(x, y, scale(c, 1.1), 0.85, 50, 220);
}

// ---------------------------------------------------------------------------
// Calabaza tallada y farol
// ---------------------------------------------------------------------------

/** Cara tallada (ojos triangulares, nariz y boca con dientes); '#' = hueco. */
const FACE = [
  '................',
  '................',
  '................',
  '...#........#...',
  '..###......###..',
  '.#####....#####.',
  '................',
  '.......##.......',
  '................',
  '.##.#######.##..',
  '.#############..',
  '..####.##.###...',
  '................',
  '................',
  '................',
  '................',
];

function carved(lit: boolean): Generator {
  return (t) => {
    pumpkinSide(t);
    const r = t.rng('face');
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (FACE[y][x] !== '#') continue;
        // Borde de arriba más oscuro (sombra del tallado).
        const shadow = y > 0 && FACE[y - 1][x] !== '#';
        if (lit) {
          const c: RGB = shadow ? [236, 150, 40] : mix([255, 214, 90], [255, 236, 150], r.next());
          t.paint(x, y, c, 0.2, 40, 0, 255);
        } else t.paint(x, y, shadow ? [26, 12, 4] : [44, 22, 8], 0.15, 20);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Compostador
// ---------------------------------------------------------------------------

/** Lateral: tablas verticales con un marco oscuro arriba y abajo. */
function composterSide(t: Tex): void {
  planks(t, OAK_PLANKS, 'composter');
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (y <= 1 || y >= 14) {
      t.setI(i, scale(OAK_PLANKS.seam, y === 0 || y === 15 ? 0.85 : 1.15));
      t.height[i] = 1;
      t.smooth[i] = 35;
    } else if (x % 4 === 0) {
      t.setI(i, OAK_PLANKS.seam);
      t.height[i] = 0.3;
    } else t.setI(i, scale(t.getI(i), 0.96 + 0.08 * r.next()));
  }
}

/** Tapa: sólo se ve el canto de las paredes (el borde del bloque). */
function composterTop(t: Tex): void {
  planks(t, OAK_PLANKS, 'composter_top');
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = Math.min(x, y, 15 - x, 15 - y);
    if (edge === 0) t.setI(i, scale(OAK_PLANKS.seam, 0.9));
    else if (edge === 1) t.setI(i, OAK_PLANKS.dark);
  }
}

function composterBottom(t: Tex): void {
  planks(t, OAK_PLANKS, 'composter_bottom');
  for (let i = 0; i < N; i++) t.setI(i, scale(t.getI(i), 0.82));
}

/** Compost: tierra oscura con restos verdes; listo, con motas blancas de polvo de hueso. */
function compost(ready: boolean): Generator {
  return (t) => {
    const r = t.rng();
    const px = pixelNoise(r);
    for (let i = 0; i < N; i++) {
      let c: RGB = mix([62, 42, 24], [96, 68, 38], px[i]);
      if (!ready && r.chance(0.12)) c = mix([66, 104, 36], [104, 134, 52], r.next());
      if (ready && r.chance(0.16)) c = mix([222, 216, 196], [246, 244, 232], r.next());
      t.setI(i, c);
      t.height[i] = 0.4 + 0.6 * px[i];
      t.smooth[i] = 20;
    }
  };
}

export const GOURD_GENERATORS: Record<string, Generator> = {
  melon_side: melonSide,
  melon_top: melonTop,
  stem_attached: stemAttached,
  carved_pumpkin: carved(false),
  jack_o_lantern: carved(true),
  composter_side: composterSide,
  composter_top: composterTop,
  composter_bottom: composterBottom,
  compost: compost(false),
  compost_ready: compost(true),
};
for (let s = 0; s < 8; s++) GOURD_GENERATORS[`stem_stage${s}`] = stem(s);
