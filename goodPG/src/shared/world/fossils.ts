// Fase 7.5 (fauna): fósiles. Esqueletos de bloques de hueso enterrados bajo los desiertos y los pantanos,
// como en Minecraft Java: cráneos y espinazos con costillas (cuatro formas de cada), girados al azar.
// Cada bloque de hueso se pone con un 90 % de probabilidad y encima va una capa de mena en un 10 % de las
// piezas: carbón en los fósiles de arriba (a 15–24 bloques bajo la superficie) y diamante de pizarra
// profunda en los hondos (bajo y = 0). Sólo sustituyen piedra y tierra: una cueva los deja al aire.
// Se reparten por regiones (structures.ts): uno de cada ~36 chunks de desierto o pantano, y /localizar
// los encuentra (clave 'fossil').
import {
  AIR, BONE_BLOCK, BONE_BLOCK_AXIS, COAL_ORE, DIAMOND_ORE, DEEPSLATE, DEEPSLATE_ORE, MOB_SPAWNER, BLOCK_FLUID, AXIS_X, AXIS_Z, isChest,
} from '../blocks';
import { MIN_Y, hash2, hash3 } from '../constants';
import type { VillageCanvas, VillageStart } from './villages';
import type { TerrainGenerator } from './terrain';
import { BIOME_DESERT, BIOME_SWAMP, baseBiome } from './biomeIds';

/** Radio de la caja alrededor del origen (el espinazo más largo mide 13). */
export const FOSSIL_RADIUS = 8;
/** Integridad de los huesos y de la capa de mena (como en Minecraft). */
export const FOSSIL_INTEGRITY = 0.9;
export const FOSSIL_ORE_INTEGRITY = 0.1;

/** Pieza de un fósil: posición local y eje del hueso ('y' de pie, 'x' o 'z' tumbado). */
type Piece = [number, number, number, 'x' | 'y' | 'z'];

type Canvas = Pick<VillageCanvas, 'get' | 'set'>;

/**
 * Candidata: en desiertos y pantanos. La mitad son fósiles de arriba y la mitad hondos (bajo y = 0). Como en
 * Minecraft, no vale si más de 4 de las 8 esquinas de su caja caen en una cueva.
 */
export function fossilSite(gen: TerrainGenerator, x: number, z: number, biome: number, surface: number): number | null {
  if (biome !== BIOME_DESERT && baseBiome(biome) !== BIOME_SWAMP) return null;
  const h = hash2(x, z, gen.seed ^ 0xf055);
  const y = h % 2 === 0 ? Math.max(surface - 15 - ((h >>> 3) % 10), MIN_Y + 10) : -56 + ((h >>> 5) % 47);
  const { pieces } = fossilPieces(gen.seed, x, z);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of pieces) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k] as number);
      hi[k] = Math.max(hi[k], p[k] as number);
    }
  }
  let empty = 0;
  for (const cx of [lo[0], hi[0]]) for (const cy of [lo[1], hi[1]]) for (const cz of [lo[2], hi[2]]) if (gen.caveAt(x + cx, y + cy, z + cz)) empty++;
  return empty > 4 ? null : y;
}

// ------------------------------------------------------------------ formas

/** Espinazo a lo largo de x: vértebras arriba y costillas que bajan a los lados cada dos. */
function spine(len: number, ribDepth: number, neck: boolean): Piece[] {
  const out: Piece[] = [];
  const top = ribDepth + 1;
  for (let x = 0; x < len; x++) {
    // El cuello (si lo tiene) sube por delante.
    const lift = neck && x >= len - 3 ? x - (len - 3) + 1 : 0;
    out.push([x, top + lift, 0, lift ? 'y' : 'x']);
    const tail = x < 2;
    if (x % 2 === 1 && !tail && !(neck && x >= len - 3)) {
      for (const side of [-1, 1]) {
        out.push([x, top, side, 'z']);
        for (let d = 1; d <= ribDepth; d++) out.push([x, top - d, side * 2, 'y']);
        if (ribDepth >= 3) out.push([x, top - ribDepth, side, 'z']);
      }
    }
  }
  if (neck) out.push([len - 1, top + 4, -1, 'x'], [len - 1, top + 4, 1, 'x']); // cabeza pequeña
  return out;
}

/** Cráneo hueco de w × h × d con cuencas de los ojos, fosas nasales, mandíbula y (si se pide) cuernos o dientes. */
function skull(w: number, h: number, d: number, extra: 'horns' | 'teeth' | 'snout' | 'none'): Piece[] {
  const out: Piece[] = [];
  const snout = extra === 'snout' ? 3 : 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const shell = x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1;
        if (!shell) continue;
        // Cuencas de los ojos en la cara (z = 0) y fosa nasal en el centro de abajo.
        if (z === 0 && y === h - 2 && (x === 1 || x === w - 2)) continue;
        if (z === 0 && y === 1 && x === Math.floor(w / 2)) continue;
        // Hueco de la mandíbula en los lados de abajo.
        if (y === 1 && (x === 0 || x === w - 1) && z > 0 && z < d - 2) continue;
        out.push([x, y, z + snout, y === 0 || y === h - 1 ? 'z' : 'y']);
      }
    }
  }
  if (snout) {
    // Hocico largo por delante, más estrecho.
    for (let z = 0; z < snout; z++) {
      for (let x = 1; x < w - 1; x++) {
        out.push([x, 0, z, 'z']);
        if (x === 1 || x === w - 2) out.push([x, 1, z, 'z']);
      }
    }
  }
  if (extra === 'horns') {
    for (const x of [0, w - 1]) for (let k = 1; k <= 2; k++) out.push([x, h - 1 + k, 1, 'y']);
  } else if (extra === 'teeth') {
    for (let x = 1; x < w - 1; x += 2) out.push([x, -1, 0, 'y']);
  }
  return out;
}

/** Las ocho formas: cuatro cráneos y cuatro espinazos. */
export const FOSSIL_SHAPES: readonly (readonly Piece[])[] = [
  skull(5, 4, 5, 'none'),
  skull(7, 5, 7, 'horns'),
  skull(5, 4, 6, 'snout'),
  skull(6, 5, 6, 'teeth'),
  spine(7, 2, false),
  spine(9, 3, false),
  spine(11, 3, false),
  spine(13, 2, true),
];

// ------------------------------------------------------------------ colocación

/** Forma, giro y piezas del fósil con origen (x, z) (el mismo para todos los chunks). */
export function fossilPieces(seed: number, x: number, z: number): { shape: number; turn: number; pieces: Piece[] } {
  const h = hash2(x, z, seed ^ 0xf0551);
  const shape = h % FOSSIL_SHAPES.length;
  const turn = (h >>> 4) % 4;
  const src = FOSSIL_SHAPES[shape];
  // Centrar la forma en el origen.
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [px, , pz] of src) {
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    z0 = Math.min(z0, pz);
    z1 = Math.max(z1, pz);
  }
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const pieces = src.map(([px, py, pz, axis]): Piece => {
    const a = px - cx, b = pz - cz;
    const [ra, rb] = turn === 1 ? [-b, a] : turn === 2 ? [-a, -b] : turn === 3 ? [b, -a] : [a, b];
    const ax = axis === 'y' ? 'y' : (turn % 2 === 1) === (axis === 'x') ? 'z' : 'x';
    return [ra, py, rb, ax];
  });
  return { shape, turn, pieces };
}

/** ¿Puede el fósil ocupar este bloque? (sólo tierra y piedra: ni aire, ni agua, ni cofres o generadores). */
function replaceable(id: number): boolean {
  return id > 0 && id !== AIR && !BLOCK_FLUID[id] && id !== MOB_SPAWNER && !isChest(id);
}

export function buildFossil(c: Canvas, s: VillageStart, seed: number): void {
  const { pieces } = fossilPieces(seed, s.x, s.z);
  const deep = s.y < 0;
  for (const [a, py, b, axis] of pieces) {
    const x = s.x + a, y = s.y + py, z = s.z + b;
    const cur = c.get(x, y, z);
    if (!replaceable(cur)) continue;
    const k = hash3(x, y, z, seed ^ 0xb07e);
    // Capa de mena: un 10 % de las piezas; la mena de pizarra profunda si lo que había era pizarra.
    if ((k >>> 8) % 1000 < FOSSIL_ORE_INTEGRITY * 1000) {
      const ore = deep ? DIAMOND_ORE : COAL_ORE;
      c.set(x, y, z, deep || cur === DEEPSLATE ? DEEPSLATE_ORE[ore] ?? ore : ore);
      continue;
    }
    if (k % 1000 >= FOSSIL_INTEGRITY * 1000) continue;
    c.set(x, y, z, axis === 'y' ? BONE_BLOCK : BONE_BLOCK_AXIS + (axis === 'x' ? AXIS_X : AXIS_Z));
  }
}
