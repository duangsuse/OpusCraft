// Fase 8.2 (biomas del Nether): el carver de cuevas del Nether (carver/nether_cave.json de la 26.3 con el
// CaveWorldCarver de Java): de cada chunk sale, con probabilidad 0,2, un grupo de túneles (y a veces una
// sala) que serpentean hasta 112 bloques y se parten en dos; excavan lo que no es lecho de roca (entre
// y = 1 y 120) después de la superficie, dejando lava bajo y = 32 y aire encima.
//
// Un túnel sólo depende de su chunk de origen, así que la lista de elipsoides de cada origen se calcula una
// vez y cada chunk excava las que le tocan (el resultado es el mismo que el de Java, que deja de seguir un
// túnel cuando ya no puede llegar al chunk que se está generando).
import { hash2 } from '../constants';
import { NoiseRandom } from './javaNoise';

/** Elipsoide excavado: centro, radios y nivel de suelo (lo de debajo de yd ≤ suelo no se excava). */
export interface CarveEllipsoid {
  x: number;
  y: number;
  z: number;
  hr: number;
  vr: number;
  floor: number;
}

/** Alcance del carver en chunks (getRange) y distancia máxima de un túnel. */
const RANGE = 4;
const MAX_DISTANCE = 16 * (RANGE * 2 - 1);

/** Túneles (sus elipsoides) que salen del chunk (sx, sz), o una lista vacía. */
export function netherCaves(seed: number, sx: number, sz: number): CarveEllipsoid[] {
  const r = new NoiseRandom(hash2(sx, sz, seed ^ 0xca7e5));
  const out: CarveEllipsoid[] = [];
  if (r.nextFloat() > 0.2) return out;
  // count: very_biased_to_bottom de 0 a 9.
  const count = r.nextInt(r.nextInt(r.nextInt(10) + 1) + 1);
  for (let cave = 0; cave < count; cave++) {
    const x = sx * 16 + r.nextInt(16);
    const y = r.nextInt(127); // uniform de 0 a 126 (below_top 1)
    const z = sz * 16 + r.nextInt(16);
    const floor = -0.7; // floor_level
    let tunnels = 1;
    if (r.nextInt(4) === 0) {
      // Sala: room_vertical_radius_multiplier 0,5.
      const thickness = 1 + r.nextFloat() * 6;
      const hr = 1.5 + thickness;
      out.push({ x: x + 1, y, z, hr, vr: hr * 0.5, floor });
      tunnels += r.nextInt(4);
    }
    for (let i = 0; i < tunnels; i++) {
      const yaw = r.nextFloat() * Math.PI * 2;
      const pitch = (r.nextFloat() - 0.5) / 4;
      // thickness: trapezoid de 0 a 6 con meseta 2.
      const thickness = r.nextFloat() * 4 + r.nextFloat() * 2;
      const dist = MAX_DISTANCE - r.nextInt(MAX_DISTANCE / 4);
      // start_vertical_radius_multiplier 5.
      tunnel(out, hash2(r.nextInt(0x7fffffff), cave * 7 + i, seed), x, y, z, thickness, yaw, pitch, 0, dist, 5, floor);
    }
  }
  return out;
}

/** createTunnel de CaveWorldCarver: avanza paso a paso girando al azar y se parte en dos a media distancia. */
function tunnel(
  out: CarveEllipsoid[], tseed: number, x: number, y: number, z: number, thickness: number, yaw: number, pitch: number,
  step: number, dist: number, yScale: number, floor: number,
): void {
  const r = new NoiseRandom(tseed);
  const split = r.nextInt(dist >> 1) + (dist >> 2);
  const steep = r.nextInt(6) === 0;
  let yRota = 0, xRota = 0;
  for (let s = step; s < dist; s++) {
    const hr = 1.5 + Math.sin((Math.PI * s) / dist) * thickness;
    const vr = hr * yScale;
    const cosX = Math.cos(pitch);
    x += Math.cos(yaw) * cosX;
    y += Math.sin(pitch);
    z += Math.sin(yaw) * cosX;
    pitch *= steep ? 0.92 : 0.7;
    pitch += xRota * 0.1;
    yaw += yRota * 0.1;
    xRota *= 0.9;
    yRota *= 0.75;
    xRota += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 2;
    yRota += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 4;
    if (s === split && thickness > 1) {
      tunnel(out, r.nextInt(0x7fffffff) ^ tseed, x, y, z, r.nextFloat() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, s, dist, 1, floor);
      tunnel(out, r.nextInt(0x7fffffff) ^ (tseed * 31), x, y, z, r.nextFloat() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, s, dist, 1, floor);
      return;
    }
    if (r.nextInt(4) !== 0) out.push({ x, y, z, hr, vr, floor });
  }
}

/**
 * carveEllipsoid de WorldCarver sobre el chunk (cx, cz): llama a `carve(lx, y, lz)` en cada celda de dentro
 * (entre minY y maxY), de arriba abajo.
 */
export function carveEllipsoid(e: CarveEllipsoid, cx: number, cz: number, minY: number, maxY: number, carve: (lx: number, y: number, lz: number) => void): void {
  const x0 = cx * 16, z0 = cz * 16;
  const maxDelta = 16 + e.hr * 2;
  if (Math.abs(e.x - (x0 + 8)) > maxDelta || Math.abs(e.z - (z0 + 8)) > maxDelta) return;
  const minX = Math.max(Math.floor(e.x - e.hr) - x0 - 1, 0), maxX = Math.min(Math.floor(e.x + e.hr) - x0, 15);
  const minZ = Math.max(Math.floor(e.z - e.hr) - z0 - 1, 0), maxZ = Math.min(Math.floor(e.z + e.hr) - z0, 15);
  const y0 = Math.max(Math.floor(e.y - e.vr) - 1, minY), y1 = Math.min(Math.floor(e.y + e.vr) + 1, maxY);
  for (let lx = minX; lx <= maxX; lx++) {
    const xd = (x0 + lx + 0.5 - e.x) / e.hr;
    for (let lz = minZ; lz <= maxZ; lz++) {
      const zd = (z0 + lz + 0.5 - e.z) / e.hr;
      if (xd * xd + zd * zd >= 1) continue;
      for (let y = y1; y > y0; y--) {
        const yd = (y - 0.5 - e.y) / e.vr;
        if (yd <= e.floor || xd * xd + yd * yd + zd * zd >= 1) continue;
        carve(lx, y, lz);
      }
    }
  }
}
