// Trazado de rayos por la rejilla de vóxeles (DDA de Amanatides & Woo) con formas reales
// para plantas, antorchas, cactus y bloques hechos de cajas (losas, escaleras, vallas, puertas…).
import { MIN_Y, MAX_Y } from '../../shared/constants';
import {
  BLOCK_RENDER, BLOCK_FLUID_LEVEL, R_CUBE, R_CUTOUT, R_TRANSLUCENT, R_WATER, R_LAVA, AIR, blockSelectionBoxes,
} from '../../shared/blocks';
import { unionBox } from '../../shared/blockModels';
import { isScaffolding } from '../../shared/blocks'; // Fase 6.5 (decoración)

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Normal de la cara golpeada. */
  nx: number;
  ny: number;
  nz: number;
  id: number;
  dist: number;
  /** Punto golpeado (coordenadas del mundo). */
  px: number;
  py: number;
  pz: number;
  /** Caja de selección local [minX, minY, minZ, maxX, maxY, maxZ] (envolvente). */
  box: number[];
}

const FULL = [0, 0, 0, 1, 1, 1];

/** Intersección rayo-caja (slab). Devuelve t de entrada y normal, o null. */
function rayBox(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: number[], k: number, bx: number, by: number, bz: number,
): { t: number; n: [number, number, number] } | null {
  let tmin = -Infinity, tmax = Infinity;
  let n: [number, number, number] = [0, 0, 0];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [bx + b[k], by + b[k + 1], bz + b[k + 2]], mx = [bx + b[k + 3], by + b[k + 4], bz + b[k + 5]];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < mn[a] || o[a] > mx[a]) return null;
      continue;
    }
    let t1 = (mn[a] - o[a]) / d[a];
    let t2 = (mx[a] - o[a]) / d[a];
    let sign = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sign = 1; }
    if (t1 > tmin) {
      tmin = t1;
      n = [0, 0, 0];
      n[a] = sign;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(tmin, 0), n };
}

export function raycast(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
  getBlock: (x: number, y: number, z: number) => number,
  /** Detenerse también en fuentes de agua y lava (para el cubo). */
  fluids = false,
): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = Math.abs(1 / dx), tDY = Math.abs(1 / dy), tDZ = Math.abs(1 / dz);
  let tMX = (dx > 0 ? x + 1 - ox : ox - x) * tDX;
  let tMY = (dy > 0 ? y + 1 - oy : oy - y) * tDY;
  let tMZ = (dz > 0 ? z + 1 - oz : oz - z) * tDZ;
  let nx = 0, ny = 0, nz = 0;
  let t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = getBlock(x, y, z);
    // Fase 6.5 (decoración): desde dentro de un andamio se ve a través de él.
    if (id > AIR && !(i === 0 && isScaffolding(id))) {
      const r = BLOCK_RENDER[id];
      if (fluids && (r === R_WATER || r === R_LAVA) && BLOCK_FLUID_LEVEL[id] === 0) {
        return { x, y, z, nx, ny, nz, id, dist: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t, box: FULL };
      }
      if (r === R_CUBE || r === R_CUTOUT || r === R_TRANSLUCENT) {
        return { x, y, z, nx, ny, nz, id, dist: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t, box: FULL };
      }
      if (r !== R_WATER && r !== R_LAVA) {
        // Forma real: la caja más cercana que corte el rayo.
        const cx = x, cy = y, cz = z;
        const boxes = blockSelectionBoxes(id, (ddx, ddy, ddz) => getBlock(cx + ddx, cy + ddy, cz + ddz));
        let best: { t: number; n: [number, number, number] } | null = null;
        for (let k = 0; k + 5 < boxes.length; k += 6) {
          const h = rayBox(ox, oy, oz, dx, dy, dz, boxes, k, x, y, z);
          if (h && (!best || h.t < best.t)) best = h;
        }
        if (best && best.t <= maxDist) {
          const bt = best.t;
          return {
            x, y, z, nx: best.n[0], ny: best.n[1], nz: best.n[2], id, dist: bt,
            px: ox + dx * bt, py: oy + dy * bt, pz: oz + dz * bt, box: unionBox(boxes),
          };
        }
      }
    }
    if (tMX < tMY && tMX < tMZ) {
      x += stepX; t = tMX; tMX += tDX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMY < tMZ) {
      y += stepY; t = tMY; tMY += tDY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMZ; tMZ += tDZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if ((y < MIN_Y && stepY < 0) || (y >= MAX_Y && stepY > 0)) break;
  }
  return null;
}
