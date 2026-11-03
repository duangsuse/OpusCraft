// Fase 8.4 (estructuras del Nether): el contenido de las piezas del bastión, construido aquí (nada copiado del
// juego): cada familia de piezas (módulos de vivienda, patios con huerto de verrugas, muros, torres, establos,
// rampas, la sala del tesoro, el puente…) tiene su constructor con el tamaño y los conectores de su plantilla de
// la 26.3 (bastionData.ts) y el estilo de los bastiones: ladrillos de piedra negra pulida con manchas de piedra
// negra, vetas y goterones de basalto, oro, lava, cadenas con faroles y trozos que faltan (están en ruinas).
// Cada constructor devuelve la lista de bloques locales (x, y, z, id) de la pieza sin girar; VOID es «no tocar»
// (lo que haya en el mundo se queda) y el aire se escribe (despeja el terreno).
import {
  AIR, LAVA, GOLD_BLOCK, MAGMA_BLOCK, SOUL_SAND, STAIRS, SLABS, BLACKSTONE, POLISHED_BLACKSTONE_BRICKS,
  CRACKED_POLISHED_BLACKSTONE_BRICKS, CHISELED_POLISHED_BLACKSTONE, GILDED_BLACKSTONE, BASALT, POLISHED_BASALT, stateOf,
  NETHER_WART_CROP, NETHER_WART_MAX_AGE, CHEST, WALLS, IRON_CHAIN, CHAIN_AXIS_Y, LANTERN,
} from '../blocks';
import { hash3 } from '../constants';
import type { BastionPieceData } from './bastionData';

/** «No tocar»: la celda conserva lo que haya. */
export const VOID = -1;

// ------------------------------------------------------------------ materiales

const BR = POLISHED_BLACKSTONE_BRICKS, CR = CRACKED_POLISHED_BLACKSTONE_BRICKS, BS = BLACKSTONE, GI = GILDED_BLACKSTONE;
const KP = CHISELED_POLISHED_BLACKSTONE;
const stairs = (m: string, facing: number, half = 0) => stateOf(STAIRS[m], { facing, half });
const WALL_BLACKSTONE = WALLS.blackstone;
const CHAIN_Y = stateOf(IRON_CHAIN, { axis: CHAIN_AXIS_Y });
const LANTERN_HANGING = stateOf(LANTERN, { hanging: 1 });
const slab = (m: string, top = false) => stateOf(SLABS[m], { type: top ? 1 : 0 });

/** Lienzo de una pieza: celdas locales con VOID por defecto. */
export class PieceBuf {
  readonly cells: Int32Array;
  constructor(readonly w: number, readonly h: number, readonly d: number, readonly seed: number) {
    this.cells = new Int32Array(w * h * d).fill(VOID);
  }
  in(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d;
  }
  private i(x: number, y: number, z: number): number {
    return (y * this.d + z) * this.w + x;
  }
  get(x: number, y: number, z: number): number {
    return this.in(x, y, z) ? this.cells[this.i(x, y, z)] : VOID;
  }
  set(x: number, y: number, z: number, id: number): void {
    if (this.in(x, y, z)) this.cells[this.i(x, y, z)] = id;
  }
  solid(x: number, y: number, z: number): boolean {
    const b = this.get(x, y, z);
    return b !== VOID && b !== AIR;
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number | ((x: number, y: number, z: number) => number)): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let z = Math.max(0, z0); z <= Math.min(this.d - 1, z1); z++) {
        for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.set(x, y, z, typeof id === 'number' ? id : id(x, y, z));
      }
    }
  }
  /** Azar propio de la celda (0..1) para la capa `k`. */
  n(x: number, y: number, z: number, k = 0): number {
    return (hash3(x * 7 + k * 131, y * 13 + k * 17, z * 5 + k * 31, this.seed) >>> 8) / 16777216;
  }
  /** Ruido por manchas (celdas de `s` bloques): da la mancha, no el píxel. */
  blob(x: number, y: number, z: number, s: number, k = 0): number {
    return this.n(Math.floor(x / s), Math.floor(y / s), Math.floor(z / s), 100 + k);
  }
  /** Ladrillo del bastión: ladrillos pulidos con manchas de piedra negra (y alguna dorada). */
  brick(x: number, y: number, z: number, rough = 0.25): number {
    const b = this.blob(x, y, z, 3) * 0.6 + this.n(x, y, z, 1) * 0.4;
    if (b < rough * 0.08) return GI;
    return b < rough ? BS : BR;
  }
  /** Piedra negra en bruto con vetas de ladrillo (los muros macizos). */
  rough(x: number, y: number, z: number): number {
    const b = this.blob(x, y, z, 2, 3) * 0.5 + this.n(x, y, z, 4) * 0.5;
    return b > 0.9 ? CR : b < 0.015 ? GI : BS;
  }
  /** Lo de la pieza como lista x, y, z, id (sin las celdas VOID). */
  list(): Int32Array {
    const out: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let z = 0; z < this.d; z++) {
        for (let x = 0; x < this.w; x++) {
          const id = this.cells[this.i(x, y, z)];
          if (id !== VOID) out.push(x, y, z, id);
        }
      }
    }
    return Int32Array.from(out);
  }
}

// ------------------------------------------------------------------ piezas comunes

/** Goterones de basalto que cuelgan de un borde superior (los de las torres y los muros altos). */
function drips(b: PieceBuf, x: number, top: number, z: number, max: number): void {
  const len = 1 + Math.floor(b.n(x, top, z, 9) * max);
  for (let k = 0; k < len; k++) if (b.solid(x, top - k, z)) b.set(x, top - k, z, BASALT);
}

/** Almenas: merlones alternos de ladrillo con remate de basalto sobre la fila `y`. */
function crenel(b: PieceBuf, y: number, along: 'x' | 'z', fixed: number, from: number, to: number): void {
  for (let t = from; t <= to; t++) {
    const x = along === 'x' ? t : fixed, z = along === 'x' ? fixed : t;
    if (((t - from) >> 1) % 2 === 0) {
      b.set(x, y, z, b.brick(x, y, z));
      if (b.n(x, y, z, 7) < 0.6) b.set(x, y + 1, z, POLISHED_BASALT);
    }
  }
}

/** Marcador provisional: el cascarón de la pieza (paredes de ladrillo, dentro aire). */
function shell(b: PieceBuf): void {
  b.fill(0, 0, 0, b.w - 1, b.h - 1, b.d - 1, (x, y, z) => {
    const edge = x === 0 || z === 0 || x === b.w - 1 || z === b.d - 1 || y === 0;
    return edge ? b.brick(x, y, z) : AIR;
  });
}

// ------------------------------------------------------------------ viviendas (units)

/** Módulo de vivienda (12 × 7 × 8): suelo, tabique con puerta, forjado a media altura, muros y tejado con basalto. */
function housingUnit(b: PieceBuf, level: number, variant: number): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, AIR);
  const open = 0.05 + level * 0.05;
  // Suelo con algún hueco en el borde de delante.
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => (z === 0 && b.n(x, y, z, 2) < 0.5) || b.n(x, y, z, 3) < open ? AIR : b.brick(x, y, z, 0.3));
  // Muro del fondo (z = d − 1) y tabique (x = 5..6) con una puerta.
  const door = 2 + (variant % 3);
  b.fill(0, 1, d - 1, w - 1, 2, d - 1, (x, y, z) => (b.n(x, y, z, 4) < 0.25 ? AIR : b.brick(x, y, z)));
  b.fill(5, 1, 1, 6, 2, d - 2, (x, y, z) => (z >= door && z <= door + 1 ? AIR : b.brick(x, y, z)));
  // Pilastras en las esquinas de delante.
  for (const x of [0, w - 1]) b.fill(x, 1, 0, x, 2, 0, (xx, y, z) => b.brick(xx, y, z));
  // Forjado a media altura con vetas de basalto y un hueco de escalera.
  const hole = 1 + (variant * 5) % (w - 4);
  b.fill(0, 3, 0, w - 1, 3, d - 1, (x, y, z) => {
    if (x >= hole && x < hole + 2 && z >= 2 && z <= 3) return AIR;
    if (b.n(x, y, z, 5) < open * 0.7) return AIR;
    return b.blob(x, y, z, 2, 6) < 0.18 ? BASALT : b.brick(x, y, z, 0.2);
  });
  // Piso de arriba: muros bajos en el fondo y un lado, pilares sueltos.
  b.fill(0, 4, d - 1, w - 1, 5, d - 1, (x, y, z) => (b.n(x, y, z, 6) < 0.35 + level * 0.1 ? AIR : b.brick(x, y, z)));
  b.fill(0, 4, 0, 0, 5, d - 1, (x, y, z) => (b.n(x, y, z, 7) < 0.4 ? AIR : b.brick(x, y, z)));
  if (variant % 2 === 0) b.fill(5, 4, 3, 5, 5, 4, (x, y, z) => b.brick(x, y, z));
  // Tejado de medio lado con remate de basalto.
  const roofTo = level >= 2 ? 3 : 5 + (variant % 2);
  b.fill(0, 6, 0, w - 1, 6, d - 1, (x, y, z) => {
    if (x > roofTo && z < d - 3) return AIR;
    if (b.n(x, y, z, 8) < 0.2) return AIR;
    return x === 0 || z === d - 1 || b.blob(x, y, z, 2, 9) < 0.25 ? BASALT : b.brick(x, y, z);
  });
  // Escalera al piso de arriba junto al hueco del forjado.
  for (let k = 0; k < 3; k++) b.set(hole + 2, 1 + k, 2 + k, stairs('polished_blackstone_brick', 2));
}

/** Tejado de un módulo (12 × 3 × 8): losa con huecos, un pretil bajo; el resto sin tocar. */
function housingRoof(b: PieceBuf, variant: number): void {
  const { w, d } = b;
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => (b.n(x, y, z, 1) < 0.18 ? VOID : b.brick(x, y, z, 0.2)));
  b.fill(0, 1, 0, w - 1, 1, 0, (x, y, z) => (b.n(x, y, z, 2) < 0.45 ? VOID : b.brick(x, y, z)));
  b.fill(w - 3, 1, 0, w - 3, 1, 1, stairs('polished_blackstone_brick', 1 + (variant & 1) * 2));
  for (let x = 4; x < 8; x++) if (b.n(x, 2, 0, 3) < 0.6) b.set(x, 2, 0, b.brick(x, 2, 0));
}

/** Patio central (11 × 7|8 × 11): un anillo de suelo, pretiles cincelados y el huerto de verrugas con su cofre. */
function housingCenter(b: PieceBuf, data: BastionPieceData, variant: number): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, AIR);
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => {
    const inner = x >= 4 && x <= 7 && z >= 4 && z <= 7;
    if (inner) return AIR;
    return b.n(x, y, z, 1) < 0.18 ? AIR : b.brick(x, y, z, 0.3);
  });
  // Pretil bajo alrededor del huerto (cincelada y losas) con huecos para pasar.
  for (let t = 2; t <= 8; t++) {
    for (const [x, z] of [[t, 2], [t, 8], [2, t], [8, t]]) {
      if (t === 5 || b.n(x, 1, z, 2) < 0.3) continue;
      b.set(x, 1, z, b.n(x, 1, z, 3) < 0.5 ? KP : slab('blackstone'));
    }
  }
  // Huerto: arena de alma y verrugas maduras (algunas sin crecer del todo).
  const cx = 5, cz = 5, r = 1 + (variant % 2);
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r - 1; x <= cx + r; x++) {
      if (b.n(x, 0, z, 4) < 0.15) continue;
      b.set(x, 1, z, SOUL_SAND);
      b.set(x, 0, z, BS);
      if (b.n(x, 2, z, 5) < 0.8) b.set(x, 2, z, NETHER_WART_CROP + (b.n(x, 2, z, 6) < 0.7 ? NETHER_WART_MAX_AGE : 1));
    }
  }
  // Pilares sueltos con un farol en lo alto.
  for (const [x, z] of [[1, 1], [9, 9]]) {
    if (b.n(x, 0, z, 7) < 0.4) continue;
    b.fill(x, 1, z, x, 3, z, (xx, y, zz) => b.brick(xx, y, zz));
  }
  void data;
}

/** Muro macizo del recinto (16 × 24 × 16): piedra negra con vetas, huecos como cuevas, paseo y almenas arriba. */
function housingWall(b: PieceBuf, connected: boolean): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    // El frente (z alto) se rompe irregular abajo.
    if (z === d - 1 && y < 3 && b.n(x, y, z, 1) < 0.5) return VOID;
    return b.rough(x, y, z);
  });
  // Cuevas dentro del macizo (esferas achatadas).
  for (let k = 0; k < 6; k++) {
    const cx = 2 + Math.floor(b.n(k, 0, 0, 20) * (w - 4)), cy = 4 + Math.floor(b.n(k, 1, 0, 21) * (h - 10)), cz = 2 + Math.floor(b.n(k, 2, 0, 22) * (d - 4));
    const r = 1.6 + b.n(k, 3, 0, 23) * 1.8;
    b.fill(cx - 3, cy - 2, cz - 3, cx + 3, cy + 2, cz + 3, (x, y, z) => {
      const dd = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.7)) ** 2 + ((z - cz) / r) ** 2;
      return dd < 1 ? AIR : b.get(x, y, z);
    });
  }
  // Paseo de ronda: el borde de arriba hundido 2 con pretil y almenas.
  b.fill(1, h - 2, 1, w - 2, h - 1, d - 6, AIR);
  crenel(b, h - 1, 'x', 0, 0, w - 1);
  // Esquina con ladrillos agrietados (las aristas del muro).
  b.fill(0, 0, 0, 0, h - 1, 0, CR);
  if (connected) b.fill(w - 1, 0, 0, w - 1, h - 1, 0, CR);
  // Escalera de subida por el lado.
  for (let k = 0; k < 6; k++) b.set(w - 2, h - 8 + k, d - 3 - k, stairs('blackstone', 0));
}

/** Torre (16 × 32|22|12 × 16): muros de ladrillo, escalera por dentro, goterones de basalto arriba y almenas. */
function rampart(b: PieceBuf, data: BastionPieceData): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
    const edge2 = x === 1 || z === 1 || x === w - 2 || z === d - 2;
    if (edge) return b.n(x, y, z, 1) < 0.03 ? AIR : b.brick(x, y, z, 0.3);
    if (edge2 && y < h - 3) return b.brick(x, y, z, 0.35);
    return y === 0 ? b.brick(x, y, z) : AIR;
  });
  // Pisos cada 8 con un hueco de escalera y la escalera en espiral pegada al muro.
  for (let fy = 8; fy < h - 2; fy += 8) {
    b.fill(2, fy, 2, w - 3, fy, d - 3, (x, y, z) => (x >= 3 && x <= 5 && z >= 3 && z <= 5 ? AIR : b.brick(x, y, z, 0.2)));
  }
  for (let y = 1; y < h - 3; y++) {
    const s = y % 16;
    const side = Math.floor(s / 4);
    const t = s % 4;
    const [x, z, f] = side === 0 ? [3 + t, 3, 1] : side === 1 ? [6, 3 + t, 2] : side === 2 ? [6 - t, 6, 3] : [3, 6 - t, 0];
    b.set(x, y, z, stairs('polished_blackstone_brick', f));
    for (let k = 1; k <= 3; k++) if (b.get(x, y + k, z) !== VOID) b.set(x, y + k, z, AIR);
  }
  // Coronación: pretil con almenas y goterones de basalto por fuera.
  const top = h - 1;
  crenel(b, top - 1, 'x', 0, 0, w - 1);
  crenel(b, top - 1, 'x', d - 1, 0, w - 1);
  crenel(b, top - 1, 'z', 0, 0, d - 1);
  crenel(b, top - 1, 'z', w - 1, 0, d - 1);
  for (let t = 0; t < w; t += 1) {
    if (b.n(t, 0, 0, 12) < 0.45) drips(b, t, top - 2, 0, 7);
    if (b.n(t, 0, 1, 12) < 0.45) drips(b, t, top - 2, d - 1, 7);
    if (b.n(0, 0, t, 13) < 0.45) drips(b, 0, top - 2, t, 7);
    if (b.n(1, 0, t, 13) < 0.45) drips(b, w - 1, top - 2, t, 7);
  }
  void data;
}

/** Placa de muralla (5 × 19 × 16): lienzo sobre patas, con almenas de basalto. */
function rampartPlate(b: PieceBuf): void {
  const { w, h, d } = b;
  const x0 = w - 2;
  b.fill(x0, 5, 0, w - 1, h - 3, d - 1, (x, y, z) => b.brick(x, y, z, 0.2));
  for (let z = 1; z < d; z += 3) b.fill(x0, 0, z, w - 1, 4, z, (x, y, zz) => b.brick(x, y, zz));
  for (let z = 0; z < d; z++) if (((z >> 1) & 1) === 0) b.fill(x0, h - 2, z, w - 1, h - 1, z, BASALT);
  b.fill(0, 0, 0, x0 - 1, h - 1, d - 1, (x, y, z) => (b.n(x, y, z, 2) < 0.1 ? VOID : AIR));
}

/** Pasarela (3 × 2 × 2): una fila de piedra negra y aire encima. */
function pathway(b: PieceBuf): void {
  b.fill(0, 0, 0, b.w - 1, 0, b.d - 1, BS);
  b.fill(0, 1, 0, b.w - 1, 1, b.d - 1, AIR);
}

/** Base de las viviendas (46 × 24 × 46): despeja el patio donde se apilan los módulos. */
function housingAirBase(b: PieceBuf): void {
  b.fill(8, 1, 6, 41, 22, 45, (x, y, z) => (x === 8 || x === 41) && b.n(x, y, z, 1) < 0.4 ? VOID : AIR);
}

// ------------------------------------------------------------------ establos de hoglins (hoglin_stable)

/**
 * Tramo de rampa (14|15 × 6 × 16): un saliente en L (el fondo y un lado) desde el que sube una escalera de ladrillo
 * pegada al muro; el centro, abierto (se ve el tramo de abajo). Con faroles colgando y vetas de basalto y magma.
 */
function stableStairs(b: PieceBuf, variant: number, mirrored: boolean): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, AIR);
  const X = (x: number) => (mirrored ? w - 1 - x : x);
  // Suelo del saliente: el fondo (z ≥ d − 4) y el lado (x ≤ 5).
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      if (!(z >= d - 4 || x <= 5)) continue;
      if (b.n(x, 0, z, 1) < 0.06) continue;
      b.set(X(x), 0, z, b.blob(x, 0, z, 2, 2) < 0.2 ? BASALT : x > 8 && b.blob(x, 0, z, 2, 3) < 0.12 ? MAGMA_BLOCK : b.brick(x, 0, z, 0.3));
    }
  }
  // Pretil del borde del saliente y muro del lado de fuera.
  for (let z = 0; z < d - 4; z++) if (b.n(6, 1, z, 4) < 0.5) b.set(X(6), 1, z, b.brick(6, 1, z));
  for (let z = 0; z < d; z++) for (let y = 1; y <= 3; y++) b.set(X(0), y, z, b.n(0, y, z, 5) < 0.12 ? AIR : b.brick(0, y, z, 0.3));
  // Escalera: sube por el saliente del fondo (cuatro o cinco escalones).
  const run = 4 + (variant % 2);
  for (let k = 0; k < run; k++) {
    const x = 7 + k, y = 1 + k;
    for (const z of [d - 3, d - 2]) {
      b.set(X(x), y, z, stairs('polished_blackstone_brick', mirrored ? 3 : 1));
      for (let yy = 1; yy < y; yy++) b.set(X(x), yy, z, b.brick(x, yy, z, 0.4));
    }
  }
  // Pilar con farol colgando.
  const px = 3 + (variant % 3);
  for (let y = 1; y <= h - 2; y++) b.set(X(px), y, d - 1, y === h - 2 ? POLISHED_BASALT : b.brick(px, y, d - 1));
  b.set(X(px), h - 3, d - 2, LANTERN_HANGING);
  // Techo parcial del fondo.
  for (let z = d - 2; z < d; z++) for (let x = 0; x < w; x++) b.set(X(x), h - 1, z, b.n(x, h - 1, z, 6) < 0.4 ? AIR : b.brick(x, h - 1, z));
}

/** Corral (14|12 × 6 × 8): suelo de ladrillo y basalto, murete y vallas de piedra negra, techo a medias. */
function stablePen(b: PieceBuf, inner: boolean, variant: number): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, AIR);
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => (b.n(x, y, z, 1) < 0.08 ? AIR : b.blob(x, y, z, 2, 2) < 0.3 ? BASALT : b.brick(x, y, z, 0.25)));
  // Murete del fondo y los lados, con vallas encima.
  for (let x = 0; x < w; x++) {
    b.set(x, 1, d - 1, b.brick(x, 1, d - 1));
    if (b.n(x, 2, d - 1, 3) < 0.7) b.set(x, 2, d - 1, WALL_BLACKSTONE);
  }
  for (const x of [0, w - 1]) {
    for (let z = 0; z < d; z++) {
      b.set(x, 1, z, b.brick(x, 1, z));
      if (b.n(x, 2, z, 4) < 0.6) b.set(x, 2, z, WALL_BLACKSTONE);
    }
  }
  // Delante: vallas con una puerta (la del corral de fuera, en medio).
  const gate = inner ? 2 + (variant % 3) : (w >> 1) - 1;
  for (let x = 1; x < w - 1; x++) if (x < gate || x > gate + 1) b.set(x, 1, 0, WALL_BLACKSTONE);
  // Un comedero de piedra negra.
  b.set(2 + (variant % 4), 1, d - 2, slab('blackstone'));
  // Techo del fondo sobre pilares.
  for (const x of [0, w - 1]) b.fill(x, 3, d - 1, x, h - 2, d - 1, (xx, y, z) => b.brick(xx, y, z));
  b.fill(0, h - 1, 3, w - 1, h - 1, d - 1, (x, y, z) => (b.n(x, y, z, 5) < 0.25 ? AIR : b.blob(x, y, z, 2, 6) < 0.3 ? BASALT : b.brick(x, y, z)));
}

/** Poste (2 × 24 × 2|10): columna de ladrillo con vetas de basalto; el de escalera, con un lienzo de muro. */
function stablePost(b: PieceBuf, stair: boolean): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, 1, (x, y, z) => (b.blob(x, y, z, 3, 1) < 0.25 ? BASALT : b.brick(x, y, z, 0.2)));
  if (stair) {
    b.fill(0, 0, 2, w - 1, h - 1, d - 1, (x, y, z) => (y % 6 === 0 || (z === d - 1 && y < h - 4) ? b.brick(x, y, z) : b.n(x, y, z, 2) < 0.5 ? VOID : AIR));
  }
  b.fill(0, h - 1, 0, w - 1, h - 1, 1, POLISHED_BASALT);
}

/** Muro de los establos y del puente (16 × 24 × 16): el macizo del recinto con más ladrillo y ventanas en arco. */
function stableWall(b: PieceBuf, side: boolean): void {
  housingWall(b, side);
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    const id = b.get(x, y, z);
    return id === BS && b.blob(x, y, z, 2, 30) < 0.45 ? b.brick(x, y, z, 0.1) : id;
  });
  for (let x = 3; x < w - 3; x += 5) b.fill(x, h - 10, 0, x + 1, h - 7, 1, AIR);
}

/** Base de los establos (30 × 24 × 48): despeja casi todo su volumen. */
function stableAirBase(b: PieceBuf): void {
  b.fill(0, 1, 0, b.w - 1, b.h - 1, b.d - 1, (x, y, z) => (x === 0 || x === b.w - 1) && b.n(x, y, z, 1) < 0.3 ? VOID : AIR);
}

// ------------------------------------------------------------------ sala del tesoro (treasure)

/** Base del tesoro (38 × 48 × 38): despeja la gran columna central de 24 × 48 × 24. */
function treasureAirBase(b: PieceBuf): void {
  b.fill(7, 0, 7, 30, b.h - 1, 30, AIR);
}

/**
 * Cuenca de lava (24 × 11 × 24): suelo de ladrillo, un lago de lava de dos de hondo con postes cada tres, la
 * plataforma del pedestal, el generador de cubos de magma colgado de una cadena y la pasarela alta del centro.
 */
function treasureBasin(b: PieceBuf, data: BastionPieceData): void {
  const { w, d } = b;
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => (b.n(x, y, z, 1) < 0.05 ? BS : BR));
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const platform = x >= 15 && z >= 10 && z <= 13;
      const post = x % 3 === 0 && z % 3 === 2;
      for (const y of [1, 2]) {
        if (platform) b.set(x, y, z, y === 2 && b.blob(x, y, z, 2, 2) < 0.4 ? BS : BR);
        else if (post) b.set(x, y, z, b.n(x, y, z, 3) < 0.15 ? BS : BR);
        else b.set(x, y, z, b.n(x, y, z, 4) < 0.04 ? BS : LAVA);
      }
    }
  }
  // Pasarela alta por el centro (x 10..13) con huecos.
  b.fill(10, 10, 0, 13, 10, d - 1, (x, y, z) => (b.n(x, y, z, 5) < 0.12 ? AIR : b.brick(x, y, z, 0.2)));
  // La cadena del generador, desde la pasarela.
  for (const [sx, sy, sz] of data.sp ?? []) for (let y = sy + 1; y < 10; y++) b.set(sx, y, sz, CHAIN_Y);
}

/** Pedestal del tesoro (7 × 6 × 8): dos patas, la losa, el anillo de bloques de oro y el cofre en medio. */
function treasureCenter(b: PieceBuf, variant: number): void {
  const { w, d } = b;
  for (const x0 of [0, 5]) b.fill(x0, 0, 0, x0 + 1, 1, d - 1, (x, y, z) => (x0 === 0 && z >= 3 && z <= 4 ? VOID : b.brick(x, y, z, 0.15)));
  b.fill(0, 2, 0, w - 1, 2, d - 1, (x, y, z) => (x >= 3 && x <= 4 && z >= 3 && z <= 4 ? WALL_BLACKSTONE : b.brick(x, y, z, 0.12)));
  // Anillo de oro (el procesador cambia parte por ladrillo agrietado) y algo de oro suelto encima.
  for (let z = 2; z <= d - 3; z++) {
    for (let x = 2; x <= w - 2; x++) {
      const ring = x === 2 || x === w - 2 || z === 2 || z === d - 3;
      if (ring && b.n(x, 3, z, 2) < (variant === 3 ? 0.5 : 0.85)) b.set(x, 3, z, GOLD_BLOCK);
    }
  }
  for (let k = 0; k < 4; k++) {
    const x = 2 + Math.floor(b.n(k, 4, 0, 3) * 3), z = 2 + Math.floor(b.n(k, 4, 1, 3) * 4);
    b.set(x, 4, z, GOLD_BLOCK);
  }
}

/** Esquina (5 × 15|16 × 5): torre hueca con dos caras macizas, basalto en la arista y pisos cada cinco. */
function treasureCorner(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    if (x === 0 || z === 0) return x === 0 && z === 0 ? BASALT : b.brick(x, y, z, 0.2);
    if (y % 5 === 0) return b.n(x, y, z, 1) < 0.15 ? AIR : b.brick(x, y, z, 0.2);
    return AIR;
  });
}

/** Arista (2 × 15..17 × 2): columna maciza de ladrillo y basalto. */
function treasureEdge(b: PieceBuf): void {
  b.fill(0, 0, 0, b.w - 1, b.h - 1, b.d - 1, (x, y, z) => (b.blob(x, y, z, 3, 1) < 0.3 ? BASALT : b.brick(x, y, z, 0.15)));
}

/**
 * Tramo de muro (5 × 15|16 × 24): la piel de fuera maciza (x 0..1), por dentro arcos entre pilastras, un paseo a
 * media altura y, en el de abajo, cadenas con faroles colgando hacia la lava.
 */
function treasureWall(b: PieceBuf, level: 'bottom' | 'mid' | 'top', variant: number): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, AIR);
  b.fill(0, 0, 0, 1, h - 1, d - 1, (x, y, z) => b.brick(x, y, z, 0.12));
  for (let z = 0; z < d; z++) {
    const pil = z % 6 === 0 || z % 6 === 5;
    for (let y = 0; y < h; y++) {
      const arch = !pil && y >= 3 && y <= h - 5 - (Math.abs((z % 6) - 2.5) < 1.5 ? 0 : 1);
      if (arch) continue;
      for (let x = 2; x < w; x++) {
        if (y === h - 1 || y === (h >> 1) || pil) b.set(x, y, z, pil && b.blob(x, y, z, 3, 2) < 0.2 ? BASALT : b.brick(x, y, z, 0.2));
      }
    }
  }
  // Paseo a media altura hacia dentro, con losas en el borde.
  const my = h >> 1;
  for (let z = 0; z < d; z++) if (b.n(w - 1, my, z, 3) < 0.4) b.set(w - 1, my, z, slab('polished_blackstone_brick', true));
  if (level === 'bottom') {
    for (let z = 3 + variant; z < d; z += 7) {
      const len = 3 + Math.floor(b.n(z, 0, 0, 4) * 4);
      for (let k = 1; k <= len; k++) b.set(w - 1, my - k, z, CHAIN_Y);
      b.set(w - 1, my - len - 1, z, LANTERN_HANGING);
    }
  }
  if (level === 'top') for (let z = 0; z < d; z++) if (((z >> 1) & 1) === 0) b.set(1, h - 1, z, POLISHED_BASALT);
}

/** Piel exterior (2 × 15..17 × 5..24): maciza, con vetas de basalto; la de la lava, con coladas; la de la entrada, con su hueco. */
function treasureSkin(b: PieceBuf, kind: 'plain' | 'lava' | 'entrance'): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => (b.blob(x, y, z, 3, 1) < 0.12 ? BASALT : b.brick(x, y, z, 0.1)));
  if (kind === 'lava') for (let z = 2; z < d - 1; z += 4) b.fill(0, 0, z, 0, h - 3, z, LAVA);
  if (kind === 'entrance') b.fill(0, 1, (d >> 1) - 2, w - 1, 6, (d >> 1) + 1, AIR);
}

/** Techo (24|5 × 2 × 24|5): losa maciza con pretil. */
function treasureRoof(b: PieceBuf): void {
  const { w, d } = b;
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => b.brick(x, y, z, 0.2));
  b.fill(0, 1, 0, w - 1, 1, d - 1, (x, y, z) => {
    const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
    return edge && ((x + z) & 1) === 0 ? POLISHED_BASALT : b.brick(x, y, z, 0.25);
  });
}

/** Escalera baja (2 × 5 × 5): cinco escalones de ladrillo. */
function treasureStairs(b: PieceBuf): void {
  for (let k = 0; k < 5; k++) {
    b.fill(0, k, k, b.w - 1, k, k, stairs('polished_blackstone_brick', 2));
    if (k > 0) b.fill(0, 0, k, b.w - 1, k - 1, k, (x, y, z) => b.brick(x, y, z));
  }
}

/** Torres de fuera del tesoro (16..19 × 18..36 × 14): muros escalonados de ladrillo con coladas de lava que caen. */
function treasureRampart(b: PieceBuf, key: string): void {
  const { w, h, d } = b;
  const lavaBasin = key.includes('lava_basin');
  const solid = lavaBasin ? 0.85 : key.includes('bottom') ? 0.6 : 0.45;
  const faceAt = (y: number) => Math.max(0, d - 1 - Math.floor(y / 6));
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    // Terrazas: cada 6 de alto la cara retrocede un bloque.
    const face = faceAt(y);
    if (z > face) return AIR;
    const shell = x === 0 || x === w - 1 || z === face || z === 0 || y === 0;
    if (shell) return b.brick(x, y, z, 0.2);
    return b.n(x, y, z, 2) < solid ? b.brick(x, y, z, 0.3) : AIR;
  });
  // Coladas de lava desde lo alto por la cara de delante.
  const streams = lavaBasin ? 4 : 2;
  for (let k = 0; k < streams; k++) {
    const x = 2 + Math.floor(b.n(k, 0, 0, 3) * (w - 4));
    for (let y = h - 2; y > 0; y--) b.set(x, y, faceAt(y), LAVA);
  }
  // Almenas y goterones arriba.
  crenel(b, h - 1, 'x', faceAt(h - 1), 0, w - 1);
  for (let x = 0; x < w; x++) if (b.n(x, 0, 0, 5) < 0.4) drips(b, x, h - 2, faceAt(h - 2), 6);
}

/** Portada de la entrada (19 × 18 × 20): dos lienzos laterales y un arco de ladrillo con oro; dentro, despejado. */
function treasureEntrance(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => (b.n(x, y, z, 1) < 0.35 ? VOID : AIR));
  for (const x0 of [0, w - 3]) b.fill(x0, 0, 0, x0 + 2, h - 4, d - 1, (x, y, z) => (b.n(x, y, z, 2) < 0.1 ? AIR : b.brick(x, y, z, 0.15)));
  for (let x = 0; x < w; x++) {
    const arch = Math.round(Math.sqrt(Math.max(0, 1 - ((x - (w - 1) / 2) / ((w - 1) / 2)) ** 2)) * 4);
    b.fill(x, h - 5 + arch, 0, x, h - 1, 2, (xx, y, z) => b.brick(xx, y, z, 0.15));
  }
  b.set((w >> 1) - 1, h - 1, 1, GOLD_BLOCK);
  b.set(w >> 1, h - 1, 1, GOLD_BLOCK);
}

/** Pasarela (3|4 × 2 × N): losa de ladrillo; la ancha, con pretil a un lado. */
function treasureBridge(b: PieceBuf, large: boolean): void {
  const { w, d } = b;
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => (b.n(x, y, z, 1) < 0.08 ? VOID : b.brick(x, y, z, 0.25)));
  if (large) b.fill(0, 1, 0, 0, 1, d - 1, (x, y, z) => (b.n(x, y, z, 2) < 0.4 ? VOID : WALL_BLACKSTONE));
}

/** Pasarela cubierta (10 × 6 × 4): suelo, dos filas de pilares y un techo de ladrillo. */
function treasureRoofedBridge(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, 0, d - 1, (x, y, z) => b.brick(x, y, z, 0.25));
  for (let x = 0; x < w; x += 3) for (const z of [0, d - 1]) b.fill(x, 1, z, x, h - 2, z, (xx, y, zz) => b.brick(xx, y, zz));
  b.fill(0, h - 1, 0, w - 1, h - 1, d - 1, (x, y, z) => (b.n(x, y, z, 2) < 0.2 ? AIR : b.brick(x, y, z, 0.25)));
  b.fill(1, 1, 1, w - 2, h - 2, d - 2, AIR);
}

/** Casita (5 × 12 × 10): dos pisos de muros de ladrillo con ventanas y un farol. */
function treasureHouse(b: PieceBuf, variant: number): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
    if (y === 0 || y === 6 || y === h - 1) return b.brick(x, y, z, 0.2);
    if (edge) return (y === 3 || y === 9) && z % 3 === 1 ? AIR : b.brick(x, y, z, 0.25);
    return AIR;
  });
  b.fill(2, 1, 0, 2, 3, 0, AIR);
  b.set(2, 5, d >> 1, LANTERN_HANGING);
  if (variant) for (let k = 0; k < 4; k++) b.set(1, 7 + k, 1 + k, stairs('polished_blackstone_brick', 2));
}

/** Sala del fuego (10 × 10 × 10): un cubo de ladrillo con suelo de magma. */
function treasureFireRoom(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1 || y === 0 || y === h - 1;
    if (!edge) return AIR;
    return (y === 4 || y === 5) && (x === w >> 1 || z === d >> 1) ? AIR : b.brick(x, y, z, 0.3);
  });
  b.fill(1, 0, 1, w - 2, 0, d - 2, MAGMA_BLOCK);
}

// ------------------------------------------------------------------ puente (bridge)

/**
 * Tramo de puente (31 × 19 × 16): dos pilares macizos, el tablero con arco por debajo y pretiles, remates de basalto
 * pulido, faroles colgados de cadenas y una corona de oro sobre el primer pilar.
 */
function bridgeSpan(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => (y >= 4 && z >= 2 && z <= d - 3 && b.n(x, y, z, 1) < 0.9 ? AIR : VOID));
  const pillars = [6, 24];
  for (const px of pillars) b.fill(px, 0, 1, px + 2, h - 5, d - 3, (x, y, z) => (b.blob(x, y, z, 3, 2) < 0.2 ? BASALT : b.brick(x, y, z, 0.3)));
  // Tablero a y = 8 (con arco por debajo entre los pilares).
  for (let x = 0; x < w; x++) {
    const between = x > 8 && x < 24;
    const arch = between ? Math.round(Math.sqrt(Math.max(0, 1 - ((x - 16) / 7.5) ** 2)) * 3) : 0;
    b.fill(x, 8 - arch, 4, x, 8, d - 5, (xx, y, z) => (y === 8 ? b.brick(xx, y, z, 0.25) : b.n(xx, y, z, 2) < 0.2 ? AIR : b.brick(xx, y, z, 0.3)));
    for (const z of [4, d - 5]) if (b.n(x, 9, z, 3) < 0.7) b.set(x, 9, z, (x & 1) === 0 ? WALL_BLACKSTONE : b.brick(x, 9, z));
  }
  // Remate de los pilares y, en el primero, la corona de oro con escalones.
  for (const px of pillars) b.fill(px, h - 5, 1, px + 2, h - 4, 3, POLISHED_BASALT);
  b.fill(pillars[0], h - 3, 1, pillars[0] + 2, h - 3, 3, (x, y, z) => stairs('polished_blackstone_brick', z === 1 ? 2 : z === 3 ? 0 : 1));
  b.fill(pillars[0], h - 1, 2, pillars[0] + 2, h - 1, 3, GOLD_BLOCK);
  b.set(pillars[0] + 1, h - 2, 2, GOLD_BLOCK);
  // Faroles en cadenas bajo el tablero.
  for (const x of [12, 20, 28]) {
    for (let y = 4; y < 8; y++) b.set(x, y, 4, CHAIN_Y);
    b.set(x, 3, 4, LANTERN_HANGING);
  }
}

/** Pata (3 × 22 × 3): pilar macizo que baja hasta el suelo. */
function bridgeLeg(b: PieceBuf): void {
  b.fill(0, 0, 0, b.w - 1, b.h - 1, b.d - 1, (x, y, z) => ((x === 0 || x === 2) && (z === 0 || z === 2) && b.n(x, y, z, 1) < 0.1 ? VOID : b.brick(x, y, z, 0.35)));
}

/** Enlace del puente (8 × 8|11 × 19): rampa de ladrillo con pretiles. */
function bridgeConnector(b: PieceBuf): void {
  const { w, h, d } = b;
  for (let z = 0; z < d; z++) {
    const y = Math.min(h - 3, Math.floor((z * (h - 3)) / d));
    b.fill(1, y, z, w - 2, y, z, (x, yy, zz) => b.brick(x, yy, zz, 0.3));
    b.fill(1, y + 1, z, w - 2, y + 2, z, AIR);
    for (const x of [0, w - 1]) if (b.n(x, y, z, 2) < 0.7) b.set(x, y + 1, z, b.brick(x, y + 1, z));
  }
}

/** Base de la entrada (16 × 32 × 32): un macizo de piedra negra con bolsas de lava y vetas de ladrillo. */
function bridgeEntranceBase(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    if ((x === 0 || x === w - 1 || z === 0 || z === d - 1) && y > h - 6 && b.n(x, y, z, 1) < 0.4) return VOID;
    return b.blob(x, y, z, 4, 2) < 0.08 && y < h - 4 ? LAVA : b.rough(x, y, z);
  });
  b.fill(1, h - 3, 1, w - 2, h - 1, d - 2, AIR);
  crenel(b, h - 3, 'z', 0, 0, d - 1);
}

/** Edificio de la entrada (17 × 32 × 32): muros de ladrillo, salas por pisos, escaleras y cascadas de lava. */
function bridgeEntrance(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
    const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
    if (edge) return y % 8 >= 3 && y % 8 <= 5 && (x + z) % 5 === 2 ? AIR : b.blob(x, y, z, 3, 1) < 0.15 ? BASALT : b.brick(x, y, z, 0.25);
    if (y % 8 === 0) return b.n(x, y, z, 2) < 0.1 ? AIR : b.brick(x, y, z, 0.25);
    return AIR;
  });
  // Escalera por pisos (un tramo por piso, alternando lados).
  for (let fy = 0; fy < h - 8; fy += 8) {
    const zs = fy % 16 === 0 ? 3 : d - 11;
    for (let k = 0; k < 8; k++) {
      for (const x of [2, 3]) {
        b.set(x, fy + 1 + k, zs + k, stairs('polished_blackstone_brick', 2));
        b.set(x, fy + 8, zs + k, AIR);
      }
    }
  }
  // Cascadas de lava por dentro del muro de fuera.
  for (const z of [8, d - 9]) b.fill(w - 2, 1, z, w - 2, h - 3, z, LAVA);
  crenel(b, h - 1, 'x', 0, 0, w - 1);
  crenel(b, h - 1, 'x', d - 1, 0, w - 1);
}

/** Fachada (5 × 24 × 32): un paño de ladrillo con pilastras de basalto. */
function bridgeFace(b: PieceBuf): void {
  const { w, h, d } = b;
  b.fill(w - 2, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => (z % 8 === 0 ? BASALT : b.n(x, y, z, 1) < 0.08 ? VOID : b.brick(x, y, z, 0.2)));
  for (let z = 0; z < d; z += 8) b.fill(w - 3, 0, z, w - 3, h - 1, z, POLISHED_BASALT);
}

// ------------------------------------------------------------------ despacho

/** Construye la pieza `key` (su contenido local sin girar) con su propio azar. */
export function buildBastionPiece(key: string, data: BastionPieceData, seed: number): Int32Array {
  const [w, h, d] = data.s;
  const b = new PieceBuf(w, h, d, seed);
  const variant = Number(/(\d+)$/.exec(key)?.[1] ?? 0);
  const fam = key.slice(0, key.lastIndexOf('/'));
  if (key === 'units/air_base') housingAirBase(b);
  else if (fam === 'units/center_pieces') housingCenter(b, data, variant);
  else if (fam === 'units/stages' || fam === 'units/stages/rot') {
    if (key.startsWith('units/stages/stage_3')) housingRoof(b, variant);
    else housingUnit(b, Number(/stage_(\d)/.exec(key)?.[1] ?? 0), variant);
  } else if (fam === 'units/edges' || fam === 'units/fillers' || fam === 'units/wall_units') housingUnit(b, 0, variant + 1);
  else if (fam === 'units/pathways') pathway(b);
  else if (fam === 'units/walls') housingWall(b, key.endsWith('connected_wall'));
  // Establos.
  else if (key === 'hoglin_stable/air_base') stableAirBase(b);
  else if (fam === 'hoglin_stable/starting_pieces' || fam === 'hoglin_stable/stairs') stableStairs(b, variant, key.includes('mirrored'));
  else if (fam.endsWith('_stables')) stablePen(b, key.includes('inner'), variant);
  else if (fam === 'hoglin_stable/posts') stablePost(b, key.endsWith('stair_post'));
  else if (fam === 'hoglin_stable/walls' || fam === 'bridge/walls') stableWall(b, !key.endsWith('wall_base'));
  // Tesoro.
  else if (key === 'treasure/big_air_full') treasureAirBase(b);
  else if (key === 'treasure/bases/lava_basin') treasureBasin(b, data);
  else if (fam === 'treasure/bases/centers') treasureCenter(b, variant);
  else if (fam.startsWith('treasure/corners/')) {
    if (fam === 'treasure/corners/edges') treasureEdge(b);
    else treasureCorner(b);
  } else if (fam === 'treasure/walls/bottom' || fam === 'treasure/walls/mid' || fam === 'treasure/walls/top') {
    treasureWall(b, fam.endsWith('bottom') ? 'bottom' : fam.endsWith('mid') ? 'mid' : 'top', variant);
  } else if (fam === 'treasure/walls/outer') treasureSkin(b, 'plain');
  else if (key === 'treasure/walls/lava_wall') treasureSkin(b, 'lava');
  else if (key === 'treasure/walls/entrance_wall') treasureSkin(b, 'entrance');
  else if (fam === 'treasure/roofs') treasureRoof(b);
  else if (fam === 'treasure/stairs') treasureStairs(b);
  else if (fam === 'treasure/ramparts') treasureRampart(b, key);
  else if (fam === 'treasure/entrances') treasureEntrance(b);
  else if (key.startsWith('treasure/extensions/') && key.includes('bridge_')) treasureBridge(b, key.includes('large'));
  else if (key === 'treasure/extensions/roofed_bridge') treasureRoofedBridge(b);
  else if (key.startsWith('treasure/extensions/house')) treasureHouse(b, variant);
  else if (key === 'treasure/extensions/fire_room') treasureFireRoom(b);
  // Puente.
  else if (key === 'bridge/bridge_pieces/bridge') bridgeSpan(b);
  else if (fam === 'bridge/legs') bridgeLeg(b);
  else if (fam === 'bridge/connectors') bridgeConnector(b);
  else if (key === 'bridge/starting_pieces/entrance_base') bridgeEntranceBase(b);
  else if (key === 'bridge/starting_pieces/entrance') bridgeEntrance(b);
  else if (key === 'bridge/starting_pieces/entrance_face') bridgeFace(b);
  else if (fam.endsWith('/ramparts') && !key.startsWith('treasure')) rampart(b, data);
  else if (fam.endsWith('/rampart_plates')) rampartPlate(b);
  else if (fam === 'mobs' || fam === 'blocks' || key.includes('connectors/') || key.endsWith('extensions/empty')) {
    // Sin contenido propio (sólo sus conectores y criaturas).
    if (key === 'blocks/gold') b.set(0, 0, 0, GOLD_BLOCK);
  } else shell(b);
  return b.list();
}

void LAVA;
void MAGMA_BLOCK;
void CHEST;
void GI;
