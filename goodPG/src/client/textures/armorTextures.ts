// Armadura puesta sobre el jugador: el modelo de cajas y su textura procedural
// (una por material, atlas de 64×64 con la disposición de boxUV()).
//
// Cada pieza es una caja algo mayor que la parte del cuerpo que cubre (como en
// Minecraft: casco, peto, hombreras y botas ~1 px; grebas ~0,5 px) y se dibuja
// con la misma matriz que esa parte. Cada caja tiene su propio rectángulo en el
// atlas, así que botas y grebas conviven en la misma pierna.
//
// Relieve en píxeles: cada cara es una placa con el borde de arriba iluminado, el
// de abajo en sombra y una arista oscura a la derecha; encima van los detalles de
// cada pieza (cresta del casco, placas del peto, rodilleras, suelas...) y el
// dibujo de cada material (costuras del cuero, remaches del hierro, destellos del
// oro y facetas del diamante).
//
// Salida: RGBA8 sRGB, fila 0 = arriba. Alpha 0 = hueco (la visera y la base del
// casco); 128..255 = opaco, y cuanto más alto más pulido (el shader de armaduras
// lo usa para el brillo especular).

import { tintRamp } from '../render/dyeArt'; // el cuero teñido
import { boxUV } from '../render/PlayerSkin';
import type { SuitMaterial as ArmorMaterial, ArmorSlot } from '../../shared/armor';

export type BodyPart = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

type Piece = 'helmet' | 'chest' | 'pauldron' | 'waist' | 'thigh' | 'boot';

export interface ArmorBox {
  piece: Piece;
  slot: ArmorSlot;
  /** Partes del cuerpo que llevan esta caja (misma geometría y UV). */
  parts: readonly BodyPart[];
  /** Esquinas en píxeles de modelo, relativas al pivote de la parte (como en EntityRenderer). */
  min: [number, number, number];
  max: [number, number, number];
  /** Rectángulo UV en el atlas (téxeles por cara: w × h × d). */
  layout: { u: number; v: number; w: number; h: number; d: number };
}

export const ARMOR_TEX_SIZE = 64;

/**
 * Cajas de la armadura. Las bases no bajan de la planta del pie (las botas quedan
 * un pelo por debajo para no parpadear con la suela) y el peto empieza por encima
 * de la cintura para que asome el cinturón de las grebas. Donde dos cajas se
 * solapan (casco y peto en el cuello, hombreras y peto, cinturón y muslos) sus
 * caras nunca están en el mismo plano: una sobresale ¼ de píxel para que no parpadeen.
 */
export const ARMOR_BOXES: readonly ArmorBox[] = [
  { piece: 'helmet', slot: 0, parts: ['head'], min: [-5.25, -1, -5.25], max: [5.25, 9.25, 5.25], layout: { u: 0, v: 0, w: 8, h: 8, d: 8 } },
  { piece: 'chest', slot: 1, parts: ['body'], min: [-5, 1, -3], max: [5, 13, 3], layout: { u: 32, v: 0, w: 8, h: 12, d: 4 } },
  { piece: 'pauldron', slot: 1, parts: ['rightArm', 'leftArm'], min: [-3.25, -4, -3.25], max: [3.25, 3.5, 3.25], layout: { u: 0, v: 16, w: 4, h: 7, d: 4 } },
  { piece: 'waist', slot: 2, parts: ['body'], min: [-4.75, -0.75, -2.75], max: [4.75, 5, 2.75], layout: { u: 16, v: 16, w: 8, h: 5, d: 4 } },
  { piece: 'thigh', slot: 2, parts: ['rightLeg', 'leftLeg'], min: [-2.5, -9.5, -2.5], max: [2.5, 0.5, 2.5], layout: { u: 40, v: 16, w: 4, h: 10, d: 4 } },
  { piece: 'boot', slot: 3, parts: ['rightLeg', 'leftLeg'], min: [-3, -12.3, -3], max: [3, -7, 3], layout: { u: 0, v: 32, w: 4, h: 5, d: 4 } },
];

/** Brillo de cada material para el shader: rugosidad del metal pulido, cuánto es metal, luz extra. */
export const ARMOR_SHINE: Readonly<Record<ArmorMaterial, { rough: number; metal: number; sheen: number }>> = {
  leather: { rough: 0.7, metal: 0, sheen: 0 },
  iron: { rough: 0.4, metal: 0.55, sheen: 0.05 },
  golden: { rough: 0.3, metal: 0.8, sheen: 0.3 },
  diamond: { rough: 0.22, metal: 0.4, sheen: 0.3 },
  copper: { rough: 0.35, metal: 0.7, sheen: 0.15 }, // Fase 6.5 (cobre)
  chainmail: { rough: 0.45, metal: 0.6, sheen: 0.05 }, // Fase 6.5 (equipo)
  turtle: { rough: 0.5, metal: 0, sheen: 0.05 },
  netherite: { rough: 0.26, metal: 0.85, sheen: 0.12 }, // Fase 8.5: metal oscuro muy pulido
};

export interface ArmorTexture {
  width: number;
  height: number;
  /** width · height · 4 bytes, sRGB, fila 0 = arriba. */
  rgba: Uint8Array;
}

type RGB = readonly [number, number, number];

/** Rampa de 5 tonos: 0 brillo, 1 base, 2 arista, 3 sombra, 4 suela/junta profunda. */
const RAMPS: Readonly<Record<ArmorMaterial, readonly RGB[]>> = {
  leather: [[204, 142, 90], [168, 106, 62], [138, 82, 44], [104, 58, 30], [64, 34, 16]],
  iron: [[252, 252, 254], [214, 214, 218], [178, 178, 184], [136, 136, 144], [86, 86, 94]],
  golden: [[255, 250, 180], [250, 214, 72], [224, 166, 34], [178, 114, 18], [112, 66, 10]],
  diamond: [[222, 255, 250], [112, 234, 222], [62, 198, 190], [32, 144, 142], [14, 84, 86]],
  copper: [[246, 176, 136], [214, 124, 86], [178, 94, 62], [136, 68, 44], [88, 42, 26]], // Fase 6.5 (cobre)
  // Fase 6.5 (equipo): anillas de acero y placas verdes del caparazón.
  chainmail: [[232, 234, 238], [178, 180, 188], [136, 138, 146], [98, 100, 108], [58, 60, 66]],
  turtle: [[150, 214, 110], [84, 160, 62], [58, 124, 46], [38, 90, 34], [22, 56, 20]],
  // Fase 8.5: netherita, gris casi negro con un tinte violáceo en los brillos.
  netherite: [[132, 118, 132], [86, 78, 86], [66, 60, 66], [46, 42, 48], [26, 24, 28]],
};

/** Pulido base (alpha) de cada material. */
const GLOSS: Readonly<Record<ArmorMaterial, number>> = { leather: 150, iron: 236, golden: 255, diamond: 255, copper: 240, chainmail: 228, turtle: 200, netherite: 250 };

/** Ruido de color por téxel (el cuero tiene grano, el metal apenas). */
const GRAIN: Readonly<Record<ArmorMaterial, number>> = { leather: 0.12, iron: 0.05, golden: 0.05, diamond: 0.04, copper: 0.06, chainmail: 0.05, turtle: 0.08, netherite: 0.05 };

// Índices de cara (orden de boxUV).
const PX = 0;
const NX = 1;
const TOP = 2;
const BOTTOM = 3;
const FRONT = 4;
const BACK = 5;

/** Un téxel de una cara con su posición en la caja. */
interface Texel {
  f: number;
  /** Coordenadas dentro de la cara: i → derecha de la imagen, j → abajo. */
  i: number;
  j: number;
  fw: number;
  fh: number;
  /** Centro del téxel en la caja: x ∈ [0, w] (w = lado +X), y ∈ [0, h] (h = arriba), z ∈ [0, d] (0 = frente). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** Hash entero → [0, 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed | 0;
  h ^= Math.imul(x | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Posición en la caja del centro del téxel (i, j) de la cara f (misma convención de esquinas que buildBox()). */
function texelAt(f: number, i: number, j: number, w: number, h: number, d: number): Texel {
  const fw = f === PX || f === NX ? d : w;
  const fh = f === TOP || f === BOTTOM ? d : h;
  const a = i + 0.5, b = j + 0.5;
  let x = 0, y = 0, z = 0;
  switch (f) {
    case PX: x = w; y = h - b; z = d - a; break;
    case NX: x = 0; y = h - b; z = a; break;
    case TOP: x = w - a; y = h; z = d - b; break;
    case BOTTOM: x = a; y = 0; z = d - b; break;
    case FRONT: x = w - a; y = h - b; z = 0; break;
    default: x = a; y = h - b; z = d; break;
  }
  return { f, i, j, fw, fh, x, y, z, w, h, d };
}

/** Caras laterales (las que tienen arriba y abajo). */
function side(t: Texel): boolean {
  return t.f !== TOP && t.f !== BOTTOM;
}

/** Hueco en la pieza (visera y base del casco). */
function hole(piece: Piece, t: Texel): boolean {
  if (piece !== 'helmet') return false;
  if (t.f === BOTTOM) return true;
  // Visera: frente abierto bajo la frente, con carrilleras a los lados.
  if (t.f === FRONT) return t.j >= 3 && (t.j >= 7 || (t.i > 0 && t.i < t.fw - 1));
  // Laterales: la mitad delantera baja queda abierta; la trasera baja hasta la nuca.
  if (t.f === PX || t.f === NX) return t.j >= 6 && t.z < t.d * 0.45;
  return false;
}

/** Tono fijo de los detalles de cada pieza (o null si manda el relieve). */
function detail(piece: Piece, mat: ArmorMaterial, t: Texel): number | null {
  const metal = mat !== 'leather';
  const { f, i, j } = t;
  switch (piece) {
    case 'helmet':
      // Cresta en el centro de la coronilla (costura en el cuero).
      if (f === TOP && (i === 3 || i === 4)) return metal ? (i === 3 ? 0 : 2) : 2;
      // Remache en la sien.
      if (metal && (f === PX || f === NX) && j === 2 && Math.abs(t.z - t.d * 0.5) < 0.6) return 0;
      break;
    case 'chest':
      if (f === FRONT) {
        if (!metal) {
          // Cordones cruzados en el pecho.
          if (j >= 1 && j <= 7 && (i === 3 || i === 4)) return (j + i) % 2 ? 3 : 1;
          break;
        }
        // Quilla central y placas del vientre.
        if (j <= 5 && i === 3) return 0;
        if (j <= 5 && i === 4) return 2;
        if (j === 6 && i > 0 && i < t.fw - 1) return 3;
        if (j === 7 && i > 0 && i < t.fw - 1) return 0;
        if (j === 9 && i > 0 && i < t.fw - 1) return 2;
        if (j === 1 && (i === 1 || i === t.fw - 2)) return 0;
      }
      if (f === BACK && metal && j === 6 && i > 0 && i < t.fw - 1) return 3;
      if (f === BOTTOM) return 3;
      break;
    case 'pauldron':
      // Dos láminas superpuestas.
      if (side(t) && j === 3) return 3;
      if (side(t) && j === 4) return metal ? 0 : 2;
      if (f === BOTTOM) return 3;
      break;
    case 'waist':
      // Cinturón con hebilla delante.
      if (side(t) && j <= 1) {
        if (f === FRONT && (i === 3 || i === 4)) return j === 0 ? 0 : 1;
        return j === 0 ? 2 : 3;
      }
      break;
    case 'thigh':
      // Rodillera.
      if (f === FRONT && j === 5) return 0;
      if (f === FRONT && j === 6) return 3;
      // Costura lateral del cuero.
      if (!metal && (f === PX || f === NX) && t.i === 1 && j % 2 === 0) return 0;
      break;
    case 'boot':
      if (side(t) && j === t.fh - 1) return 4;
      if (f === BOTTOM) return 4;
      // Cordones en el empeine del cuero; puntera reforzada en el metal.
      if (f === FRONT && !metal && j >= 1 && j <= 3 && (i === 1 || i === 2) && (i + j) % 2) return 0;
      if (f === FRONT && metal && j === t.fh - 2) return 0;
      break;
  }
  return null;
}

/** Tono por relieve: arriba iluminado, abajo en sombra, arista a la derecha. */
function bevel(piece: Piece, t: Texel, solid: (i: number, j: number) => boolean): number {
  const up = !solid(t.i, t.j - 1);
  const down = !solid(t.i, t.j + 1);
  const right = !solid(t.i + 1, t.j);
  const left = !solid(t.i - 1, t.j);
  if (t.f === BOTTOM) return 3;
  if (t.f === TOP) return up || down || left || right ? 2 : piece === 'helmet' ? 0 : 1;
  if (down) return 3;
  if (up) return 0;
  if (right) return 2;
  return 1;
}

/** Dibujo propio del material sobre los téxeles lisos. */
function pattern(mat: ArmorMaterial, t: Texel, tone: number, seed: number): number {
  if (tone !== 1) return tone;
  const r = hash3(Math.round(t.x * 2), Math.round(t.y * 2), Math.round(t.z * 2) + t.f * 131, seed);
  switch (mat) {
    case 'leather':
      // Costura punteada bajo el borde superior de cada cara.
      if (side(t) && t.j === 1 && t.i % 2 === 0) return 0;
      return r < 0.1 ? 2 : 1;
    case 'iron':
      return r < 0.06 ? 0 : r > 0.95 ? 2 : 1;
    case 'golden':
      // Reflejos en diagonal.
      if ((t.i + t.j) % 6 === 1) return 0;
      return r > 0.94 ? 2 : 1;
    case 'diamond':
      // Facetas: destellos sueltos y vetas en diagonal más oscuras.
      if (r < 0.1) return 0;
      if ((t.i - t.j + 64) % 5 === 0) return 2;
      return 1;
    case 'copper':
      // Fase 6.5 (cobre): remaches claros en las esquinas y alguna mancha más oscura.
      if ((t.i === 1 || t.i === t.fw - 2) && (t.j === 1 || t.j === t.fh - 2)) return 0;
      return r > 0.93 ? 2 : 1;
    case 'chainmail':
      // Fase 6.5 (equipo): filas de anillas (los huecos entre ellas los pone chainHole).
      return t.j % 2 === 0 ? ((t.i + (t.j >> 1)) % 2 ? 2 : 0) : 1;
    case 'turtle':
      // Placas del caparazón separadas por surcos oscuros.
      if ((t.i + 64) % 4 === 0 || (t.j + (((t.i >> 2) & 1) * 2) + 64) % 4 === 0) return 3;
      return r < 0.15 ? 0 : 1;
    case 'netherite':
      // Fase 8.5: planchas remachadas con el filo claro arriba y alguna veta violácea del temple.
      if ((t.i === 1 || t.i === t.fw - 2) && t.j === 1) return 0;
      if (t.j % 5 === 4) return 3;
      return r > 0.95 ? 0 : r < 0.05 ? 2 : 1;
  }
}

/** Fase 6.5 (equipo): huecos entre las anillas de la cota de malla (los bordes de cada cara, enteros). */
function chainHole(mat: ArmorMaterial, t: Texel): boolean {
  if (mat !== 'chainmail' || t.f === TOP || t.f === BOTTOM) return false;
  if (t.i === 0 || t.j === 0 || t.i >= t.fw - 1 || t.j >= t.fh - 1) return false;
  return t.j % 2 === 1 && (t.i + (t.j >> 1)) % 2 === 0;
}

/** Atlas de la armadura de un material. */
export function generateArmorTexture(mat: ArmorMaterial, dye?: number): ArmorTexture {
  const S = ARMOR_TEX_SIZE;
  const rgba = new Uint8Array(S * S * 4);
  const ramp = mat === 'leather' && dye !== undefined ? tintRamp(RAMPS.leather, dye) : RAMPS[mat]; // el cuero teñido
  const grain = GRAIN[mat];
  ARMOR_BOXES.forEach((box, bi) => {
    const { u, v, w, h, d } = box.layout;
    const faces = boxUV(u, v, w, h, d);
    for (let f = 0; f < 6; f++) {
      const [fu, fv, fw, fh] = faces[f];
      const solid = (i: number, j: number) =>
        i >= 0 && j >= 0 && i < fw && j < fh && !hole(box.piece, texelAt(f, i, j, w, h, d)) && !chainHole(mat, texelAt(f, i, j, w, h, d));
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          if (!solid(i, j)) continue;
          const t = texelAt(f, i, j, w, h, d);
          const fixed = detail(box.piece, mat, t);
          const tone = fixed ?? pattern(mat, t, bevel(box.piece, t, solid), 17 + bi);
          const n = 1 + (hash3(fu + i, fv + j, bi, 91) - 0.5) * grain;
          const c = ramp[tone];
          const o = ((fv + j) * S + fu + i) * 4;
          rgba[o] = Math.max(0, Math.min(255, Math.round(c[0] * n)));
          rgba[o + 1] = Math.max(0, Math.min(255, Math.round(c[1] * n)));
          rgba[o + 2] = Math.max(0, Math.min(255, Math.round(c[2] * n)));
          // Las juntas y aristas oscuras brillan menos.
          rgba[o + 3] = Math.max(128, GLOSS[mat] - (tone >= 3 ? 70 : tone === 2 ? 25 : 0));
        }
      }
    }
  });
  return { width: S, height: S, rgba };
}
