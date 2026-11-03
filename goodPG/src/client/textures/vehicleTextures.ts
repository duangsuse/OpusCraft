// Fase 7 (transporte): pieles procedurales de las barcas (una por madera), las balsas de bambú y las
// vagonetas (la de horno, apagada o encendida). Cada caja del modelo (render/vehicleModels.ts) se
// pinta según su material y su cara, con la disposición de caja de las criaturas (boxFaces).
import { boxFaces } from '../../shared/mobs';
import { BOAT_WOODS } from '../../shared/vehicles';
import { vehicleModelById, type VehicleMaterial } from '../render/vehicleModels';
import { BOAT_WOOD_COLORS } from './transportSprites';
import type { MobTexture } from '../render/MobRenderer';

type RGB = readonly [number, number, number];

/** Ruido determinista por píxel (0..1). */
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

interface Face {
  /** Cara: 0 +X, 1 −X, 2 arriba, 3 abajo, 4 −Z (delante), 5 +Z (detrás). */
  f: number;
  /** Píxel dentro de la cara (u de izquierda a derecha, v de arriba abajo) y su tamaño. */
  u: number;
  v: number;
  w: number;
  h: number;
}

/** Tablones: vetas a lo largo de las filas y juntas cada 4 filas (con el borde de abajo más oscuro). */
function planks(c: RGB, p: Face, s: number, gx: number, gy: number): RGB {
  const seam = (p.v + 1) % 4 === 0;
  const board = Math.floor(p.v / 4);
  const n = hash(gx, gy, s);
  const grain = hash(Math.floor(gx / 3) + board * 17, board, s + 1) * 0.12;
  let k = 0.92 + grain + (n - 0.5) * 0.1 - (seam ? 0.22 : 0);
  // Una junta de tope en cada tablón, en sitios distintos.
  if (Math.floor(hash(board, 7, s) * 16) === p.u % 16 && !seam) k -= 0.16;
  return shade(c, k);
}

function paint(mat: VehicleMaterial, p: Face, wood: RGB, lit: boolean, gx: number, gy: number): RGB {
  const n = hash(gx, gy, 99);
  switch (mat) {
    case 'hull': {
      // Borde de arriba claro (la borda) y la cara de fuera con los tablones.
      if (p.f === 2) return shade(wood, 1.12 + (n - 0.5) * 0.06);
      const c = planks(wood, p, 3, gx, gy);
      return p.v === 0 && p.f !== 3 ? shade(c, 1.15) : c;
    }
    case 'floor':
      return planks(shade(wood, 0.86), p, 5, gx, gy);
    case 'paddle':
      return shade(wood, 1.06 + (n - 0.5) * 0.1 - (p.f === 3 ? 0.15 : 0));
    case 'blade':
      return shade(wood, (p.u === 0 || p.u === p.w - 1 ? 0.8 : 0.96) + (n - 0.5) * 0.08);
    case 'stalk': {
      // Cañas de bambú de 2 px a lo largo, con nudos.
      const bamboo = BOAT_WOOD_COLORS.bamboo;
      const along = p.f === 0 || p.f === 1 ? p.u : p.f === 4 || p.f === 5 ? 0 : p.v;
      const across = p.f === 2 || p.f === 3 ? p.u : p.f === 4 || p.f === 5 ? p.u : p.v;
      const edge = across % 2 === 1;
      const node = (along + (Math.floor(across / 2) * 5)) % 9 === 0;
      return shade(bamboo, (edge ? 0.78 : 1.02) - (node ? 0.18 : 0) + (n - 0.5) * 0.06);
    }
    case 'beam':
      return shade(BOAT_WOOD_COLORS.bamboo, 0.7 + (n - 0.5) * 0.08 - (p.v === p.h - 1 ? 0.1 : 0));
    case 'chest': {
      const trim = p.u === 0 || p.u === p.w - 1 || p.v === p.h - 1;
      return trim ? [74, 48, 20] : planks([168, 114, 54], p, 11, gx, gy);
    }
    case 'lid': {
      const trim = p.u === 0 || p.u === p.w - 1 || p.v === 0 || (p.f !== 2 && p.v === p.h - 1);
      return trim ? [74, 48, 20] : planks([178, 124, 62], p, 12, gx, gy);
    }
    case 'latch':
      return p.v === 0 ? [236, 236, 228] : [196, 196, 190];
    case 'iron':
    case 'ironFloor': {
      // Chapa de hierro: la franja de arriba clara, remaches en las esquinas y algo de óxido abajo.
      const base: RGB = mat === 'ironFloor' ? [120, 122, 128] : [156, 158, 166];
      if (p.f === 2) return shade(base, 1.22 + (n - 0.5) * 0.05);
      let k = 1 + (n - 0.5) * 0.08;
      if (p.v === 0) k += 0.22;
      if (p.v === p.h - 1) k -= 0.2;
      const rivet = (p.u === 1 || p.u === p.w - 2) && (p.v === 1 || p.v === p.h - 2) && p.w > 4 && p.h > 4;
      if (rivet) k += 0.3;
      const c = shade(base, k);
      return p.v >= p.h - 2 && n > 0.7 ? [c[0] + 18, c[1] - 4, c[2] - 14] : c;
    }
    case 'wheel': {
      const hub = p.f <= 1 && p.u > 0 && p.u < p.w - 1 && p.v === 0;
      return hub ? [150, 150, 158] : shade([54, 54, 60], 1 + (n - 0.5) * 0.1);
    }
    case 'furnace': {
      // Piedra labrada; delante, la boca (encendida: llamas).
      const stone = shade([128, 128, 128], 0.9 + n * 0.2 - ((p.u % 6 === 5 || p.v % 4 === 3) ? 0.12 : 0));
      if (p.f === 2) return shade([150, 150, 150], 0.9 + n * 0.15);
      if (p.f === 4 && p.u >= 3 && p.u < p.w - 3 && p.v >= 5 && p.v < p.h - 2) {
        if (!lit) return shade([34, 30, 30], 0.9 + n * 0.2);
        const heat = (p.v - 5) / Math.max(1, p.h - 7);
        return heat > 0.5 ? [255, 170 + n * 60, 40] : [230, 90 + n * 50, 16];
      }
      if (p.f === 4 && p.v === 4 && p.u >= 2 && p.u < p.w - 2) return [92, 92, 94];
      return stone;
    }
    // Fase 7 (mecanismos): la tolva (hierro oscuro; arriba, el cuenco) y la dinamita (encendida: blanca).
    case 'hopper': {
      if (p.f === 2) return p.u === 0 || p.v === 0 || p.u === p.w - 1 || p.v === p.h - 1 ? [120, 120, 128] : shade([40, 40, 44], 0.9 + n * 0.2);
      return shade([74, 74, 80], (p.v === 0 ? 1.3 : 1) + (n - 0.5) * 0.1);
    }
    case 'tnt': {
      if (lit) return shade([250, 250, 250], 0.95 + n * 0.05);
      if (p.f === 2 || p.f === 3) {
        const d = Math.hypot((p.u % 6) - 2.5, (p.v % 6) - 2.5);
        return d > 2.4 ? [120, 22, 18] : d > 1.4 ? [214, 58, 42] : [226, 214, 192];
      }
      const band = p.v >= Math.floor(p.h * 0.35) && p.v <= Math.floor(p.h * 0.62);
      if (band) return shade([232, 226, 206], 0.95 + n * 0.08);
      return shade(p.u % 3 === 2 ? [150, 30, 22] : [206, 50, 38], 0.95 + n * 0.08);
    }
  }
}

/** Piel de un modelo: `variant` = madera (barcas) o encendido (vagoneta con horno). */
export function vehicleTexture(modelId: number, variant: number): MobTexture | null {
  const m = vehicleModelById(modelId);
  if (!m) return null;
  const [W, H] = m.def.atlas;
  const rgba = new Uint8Array(W * H * 4);
  const wood = BOAT_WOOD_COLORS[BOAT_WOODS[Math.max(0, Math.min(BOAT_WOODS.length - 1, variant))]];
  for (const part of m.parts) {
    const [w, h, d] = part.size.map((v) => Math.ceil(v));
    const rects = boxFaces(part.uv[0], part.uv[1], w, h, d);
    rects.forEach(([ru, rv, rw, rh], f) => {
      for (let v = 0; v < rh; v++) {
        for (let u = 0; u < rw; u++) {
          const gx = ru + u, gy = rv + v;
          if (gx >= W || gy >= H) continue;
          const c = paint(part.mat, { f, u, v, w: rw, h: rh }, wood, variant === 1, gx, gy);
          const o = (gy * W + gx) * 4;
          rgba[o] = Math.max(0, Math.min(255, Math.round(c[0])));
          rgba[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
          rgba[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
          rgba[o + 3] = 255;
        }
      }
    });
  }
  return { width: W, height: H, rgba };
}
