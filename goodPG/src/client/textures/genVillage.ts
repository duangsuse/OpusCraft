// Generadores de los bloques de trabajo de los aldeanos (fase 6): atril, mesa de cartografía, mesa de
// flechas, barril, telar, afiladora, mesa de herrería y caldero. Parten de las maderas y la piedra ya
// existentes y les dibujan encima sus detalles (mapas, plumas, aros de hierro, hilos…).

import { Tex, N, idx, mix, scale, pixelNoise, Noise, type Generator, type RGB } from './texCore';
import { WOOD_GENERATORS } from './genWood';
import { BIOME_GENERATORS } from './genBiomes';
import { stoneBase } from './genStone';

const oak = (t: Tex) => WOOD_GENERATORS.oak_planks(t);
const birch = (t: Tex) => WOOD_GENERATORS.birch_planks(t);
const spruce = (t: Tex) => WOOD_GENERATORS.spruce_planks(t);
const darkOak = (t: Tex) => BIOME_GENERATORS.dark_oak_planks(t);

/** Oscurece o aclara toda la textura. */
function tone(t: Tex, k: number): void {
  for (let i = 0; i < N; i++) t.setI(i, scale(t.getI(i), k));
}

/** Marco de 1 px más oscuro (y hundido) alrededor de la textura. */
function frame(t: Tex, k = 0.62, w = 1): void {
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (x >= w && x < 16 - w && y >= w && y < 16 - w) continue;
    t.setI(i, scale(t.getI(i), k));
    t.height[i] = Math.min(t.height[i], 0.7);
  }
}

/** Rellena un rectángulo (incluidos los extremos). */
function rect(t: Tex, x0: number, y0: number, x1: number, y1: number, c: RGB | ((x: number, y: number) => RGB), h = 1, smooth?: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      t.setI(i, typeof c === 'function' ? c(x, y) : c);
      t.height[i] = h;
      if (smooth !== undefined) t.smooth[i] = smooth;
    }
  }
}

/** Metal liso con un poco de grano (hierro de calderos, planchas y aros). */
function metal(t: Tex, dark: RGB, light: RGB, seed = 'metal'): void {
  const r = t.rng(seed);
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    t.setI(i, mix(dark, light, 0.55 * n.at(x, y) + 0.45 * px[i]));
    t.height[i] = 0.9 + 0.1 * n.at(x, y);
    t.smooth[i] = 150;
    t.f0[i] = 235;
  }
}

/** Banda de hierro horizontal (filas y0..y1) con remaches cada 5 px. */
function band(t: Tex, y0: number, y1: number, c: RGB = [118, 120, 126]): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      t.setI(i, scale(c, y === y0 ? 1.15 : y === y1 ? 0.78 : 1));
      t.height[i] = 1;
      t.smooth[i] = 150;
      t.f0[i] = 230;
    }
  }
  for (let x = 2; x < 16; x += 5) t.set(x, Math.round((y0 + y1) / 2), scale(c, 1.4));
}

// ---------------------------------------------------------------------------
// Atril
// ---------------------------------------------------------------------------

function lecternTop(t: Tex): void {
  oak(t);
  frame(t, 0.7);
  // Fase 6.5 (libros y estandartes): el tablero va vacío; el libro puesto es el del atril con libro.
}

function lecternSide(t: Tex): void {
  oak(t);
  frame(t, 0.66);
}

function lecternFront(t: Tex): void {
  oak(t);
  tone(t, 0.9);
  // Tablas verticales del poste con estantes de libros.
  for (let y = 0; y < 16; y++) for (const x of [0, 5, 10, 15]) t.set(x, y, scale(t.get(x, y), 0.6));
  const books: RGB[] = [[140, 40, 36], [46, 70, 130], [58, 110, 50], [150, 120, 40]];
  for (const y0 of [3, 10]) {
    for (let x = 1; x <= 14; x++) {
      if (x === 5 || x === 10) continue;
      const c = books[(x * 3 + y0) % 4];
      for (let y = y0; y < y0 + 4; y++) t.set(x, y, scale(c, y === y0 ? 1.15 : 1));
    }
  }
}

// ---------------------------------------------------------------------------
// Mesa de cartografía
// ---------------------------------------------------------------------------

function cartographyTop(t: Tex): void {
  darkOak(t);
  const n = new Noise(t.rng('land'), 4);
  rect(t, 1, 1, 14, 14, (x, y) => {
    const v = n.at(x, y);
    if (v > 0.62) return mix([122, 150, 78], [100, 128, 62], (x + y) & 1 ? 0.3 : 0);
    if (v < 0.36) return [110, 150, 190];
    return mix([226, 212, 170], [206, 190, 146], ((x * 3 + y) & 3) / 3);
  }, 1, 60);
  // Camino punteado y una cruz roja.
  for (let k = 0; k < 7; k++) t.set(3 + k, 12 - k, [120, 70, 40]);
  t.set(11, 4, [190, 40, 34]);
  t.set(10, 3, [190, 40, 34]);
  t.set(12, 3, [190, 40, 34]);
  t.set(10, 5, [190, 40, 34]);
  t.set(12, 5, [190, 40, 34]);
}

function cartographySide(withCompass: boolean): Generator {
  return (t) => {
    darkOak(t);
    frame(t, 0.7);
    // Hoja de papel colgada (y una brújula en el otro lado).
    rect(t, 3, 3, withCompass ? 8 : 12, 11, (x, y) => ((x + y * 3) % 5 === 0 ? [180, 164, 124] : [226, 214, 176]), 1, 60);
    if (withCompass) {
      for (let y = 5; y <= 9; y++) {
        for (let x = 10; x <= 14; x++) {
          const d = Math.hypot(x - 12, y - 7);
          if (d <= 2.3) t.set(x, y, d > 1.4 ? [150, 150, 158] : y < 7 ? [200, 44, 40] : [220, 220, 226]);
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Mesa de flechas
// ---------------------------------------------------------------------------

function fletchingTop(t: Tex): void {
  birch(t);
  frame(t, 0.72);
  // Pluma en diagonal y pedernales.
  for (let k = 0; k < 9; k++) {
    const x = 3 + k, y = 12 - k;
    t.set(x, y, [236, 236, 232]);
    if (k > 2) t.set(x + 1, y, [210, 210, 206]);
    if (k > 2 && k < 8) t.set(x, y - 1, [222, 222, 218]);
  }
  for (const [x, y] of [[11, 11], [12, 11], [12, 12], [4, 4], [5, 4]]) t.set(x, y, [58, 56, 60]);
}

function fletchingSide(t: Tex): void {
  birch(t);
  frame(t, 0.7);
  // Flecha dibujada a lo largo.
  for (let x = 2; x <= 12; x++) t.set(x, 8, [110, 80, 44]);
  for (const [x, y] of [[13, 8], [12, 7], [12, 9]]) t.set(x, y, [70, 70, 76]);
  for (const [x, y] of [[2, 7], [3, 7], [2, 9], [3, 9], [1, 6], [1, 10]]) t.set(x, y, [236, 236, 232]);
}

function fletchingFront(t: Tex): void {
  birch(t);
  frame(t, 0.7);
  // Diana: anillos rojos y blancos.
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 4.8) continue;
      const ring = Math.floor(d / 1.25);
      t.set(x, y, ring % 2 === 0 ? [196, 40, 34] : [236, 232, 222]);
      t.height[idx(x, y)] = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Barril
// ---------------------------------------------------------------------------

function barrelSide(t: Tex): void {
  spruce(t);
  // Duelas verticales (se giran las vetas: juntas cada 4 px) y dos aros de hierro.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      if (x % 4 === 0) {
        t.setI(i, scale(t.getI(i), 0.62));
        t.height[i] = 0.6;
      }
    }
  }
  band(t, 2, 3, [96, 98, 104]);
  band(t, 12, 13, [96, 98, 104]);
}

function barrelTop(t: Tex): void {
  spruce(t);
  frame(t, 0.5, 2);
  // Aro exterior de hierro y tapón en el centro.
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    if (x === 0 || y === 0 || x === 15 || y === 15) {
      t.setI(i, [96, 98, 104]);
      t.f0[i] = 230;
      t.smooth[i] = 150;
    }
  }
  rect(t, 6, 6, 9, 9, (x, y) => (x > 6 && x < 9 && y > 6 && y < 9 ? [34, 24, 16] : [70, 50, 32]), 0.5);
}

function barrelBottom(t: Tex): void {
  spruce(t);
  tone(t, 0.85);
  frame(t, 0.55, 1);
}

// ---------------------------------------------------------------------------
// Telar
// ---------------------------------------------------------------------------

function loomTop(t: Tex): void {
  oak(t);
  frame(t, 0.7);
  // Carretes de hilo a lo largo.
  for (let x = 2; x <= 13; x++) {
    t.set(x, 4, [236, 232, 222]);
    t.set(x, 5, [214, 208, 196]);
    t.set(x, 10, [196, 60, 50]);
    t.set(x, 11, [170, 46, 40]);
  }
}

function loomSide(t: Tex): void {
  oak(t);
  frame(t, 0.66);
  for (let y = 2; y <= 13; y++) for (let x = 3; x <= 12; x += 3) t.set(x, y, [226, 222, 212]);
  for (let x = 1; x <= 14; x++) t.set(x, 2, [110, 80, 48]);
}

function loomFront(t: Tex): void {
  oak(t);
  frame(t, 0.66);
  // Tela a medio tejer: franjas de colores sobre los hilos.
  const cols: RGB[] = [[196, 50, 44], [236, 232, 222], [52, 84, 170]];
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      const c = y < 8 ? cols[Math.floor((y - 3) / 2) % 3] : x % 2 === 0 ? [226, 222, 212] as RGB : scale(t.get(x, y), 0.8);
      t.set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Afiladora
// ---------------------------------------------------------------------------

function grindstoneSide(t: Tex): void {
  stoneBase(t);
  tone(t, 1.08);
  // Cara de la rueda (la caja ocupa las columnas 2..13 y las filas 0..11): borde y eje.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 5.5);
      const i = idx(x, y);
      if (d > 5.2 && d < 6.4) {
        t.setI(i, scale(t.getI(i), 0.75));
        t.height[i] = 0.7;
      } else if (d < 1.3) {
        t.setI(i, [70, 52, 32]);
        t.height[i] = 1;
      }
    }
  }
}

function grindstoneRound(t: Tex): void {
  stoneBase(t);
  tone(t, 1.05);
  for (let x = 0; x < 16; x++) for (const y of [0, 15]) t.set(x, y, scale(t.get(x, y), 0.7));
}

// ---------------------------------------------------------------------------
// Mesa de herrería
// ---------------------------------------------------------------------------

function smithingTop(t: Tex): void {
  metal(t, [52, 54, 60], [86, 88, 96], 'plate');
  frame(t, 0.6);
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) t.set(x, y, [150, 152, 160]);
}

function smithingSide(t: Tex): void {
  darkOak(t);
  band(t, 0, 2, [74, 76, 82]);
  frame(t, 0.75);
}

function smithingFront(t: Tex): void {
  smithingSide(t);
  // Martillo colgado.
  for (let y = 6; y <= 13; y++) t.set(8, y, [110, 80, 48]);
  rect(t, 6, 5, 10, 6, [140, 142, 150], 1, 150);
}

// ---------------------------------------------------------------------------
// Caldero
// ---------------------------------------------------------------------------

const IRON_DARK: RGB = [40, 40, 44];
const IRON_MID: RGB = [70, 70, 76];

function cauldronSide(t: Tex): void {
  metal(t, IRON_DARK, IRON_MID, 'side');
  // Borde de arriba más claro y abolladuras.
  for (let x = 0; x < 16; x++) {
    t.set(x, 0, [96, 96, 104]);
    t.set(x, 1, [82, 82, 90]);
  }
  for (const [x, y] of [[4, 7], [11, 5], [8, 10]]) t.set(x, y, scale(IRON_DARK, 0.8));
}

function cauldronTop(t: Tex): void {
  metal(t, [70, 70, 76], [104, 104, 112], 'rim');
}

function cauldronInner(t: Tex): void {
  metal(t, [26, 26, 30], [48, 48, 54], 'inner');
}

function cauldronBottom(t: Tex): void {
  metal(t, [34, 34, 38], [58, 58, 64], 'bottom');
  for (let i = 0; i < 16; i += 4) for (let k = 0; k < 16; k++) {
    t.set(i, k, scale(t.get(i, k), 0.8));
    t.set(k, i, scale(t.get(k, i), 0.8));
  }
}

export const VILLAGE_GENERATORS: Record<string, Generator> = {
  lectern_top: lecternTop,
  lectern_side: lecternSide,
  lectern_front: lecternFront,
  cartography_table_top: cartographyTop,
  cartography_table_side1: cartographySide(false),
  cartography_table_side2: cartographySide(true),
  fletching_table_top: fletchingTop,
  fletching_table_side: fletchingSide,
  fletching_table_front: fletchingFront,
  barrel_top: barrelTop,
  barrel_side: barrelSide,
  barrel_bottom: barrelBottom,
  loom_top: loomTop,
  loom_side: loomSide,
  loom_front: loomFront,
  grindstone_side: grindstoneSide,
  grindstone_round: grindstoneRound,
  smithing_table_top: smithingTop,
  smithing_table_side: smithingSide,
  smithing_table_front: smithingFront,
  cauldron_side: cauldronSide,
  cauldron_top: cauldronTop,
  cauldron_inner: cauldronInner,
  cauldron_bottom: cauldronBottom,
};
