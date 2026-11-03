// Fase 7.5 (fauna): cabaña de bruja de los pantanos, como la de Minecraft Java: una casita de tablones de
// abeto sobre cuatro postes de roble (que bajan hasta el fondo), con porche de vallas, ventanas, un tejado
// con reborde de escaleras, mesa de trabajo, caldero y una maceta con un champiñón rojo.
// Al generarse aparecen una bruja y un gato negro (criaturas de estructura) y dentro de su caja sólo salen
// brujas (sim/entities/critters.ts, con inHutBox). Se reparte por regiones como el resto (structures.ts).
import {
  AIR, SPRUCE_PLANKS, OAK_LOG, FENCES, STAIRS, CRAFTING_TABLE, CAULDRON, RED_MUSHROOM, potWith, stateOf,
} from '../blocks';
import { SEA_LEVEL, hash2 } from '../constants';
import type { TerrainGenerator } from './terrain';
import type { VillageCanvas, VillageStart } from './villages';
import { BIOME_SWAMP } from './biomeIds';
import { MOB_WITCH, MOB_CAT } from '../mobs';
import { CAT_SKINS } from '../companions';

/** Radio de la caja alrededor del origen (bloques): 7 × 9 de planta. */
export const SWAMP_HUT_RADIUS = 5;
/** Sal de la región (la de Minecraft para las cabañas de bruja). */
export const SWAMP_HUT_SALT = 14357620;
/** Altura de la caja (el suelo va a 1 sobre el origen y el tejado a 4). */
const HEIGHT = 7;

type Canvas = Pick<VillageCanvas, 'get' | 'set' | 'foundation' | 'clearAbove'> & {
  /** Criatura de la estructura (se guarda y no desaparece): la bruja y el gato negro. */
  mob?(type: number, x: number, y: number, z: number, variant?: number): void;
};

/** Candidata: en el pantano; el origen queda a ras del agua o del suelo (el primer bloque de aire). */
export function swampHutSite(biome: number, surface: number): number | null {
  if (biome !== BIOME_SWAMP) return null;
  return Math.max(surface + 1, SEA_LEVEL);
}

/** Giro de la cabaña (0..3), fijo para cada origen. */
function turnOf(seed: number, x: number, z: number): number {
  return hash2(x, z, seed ^ SWAMP_HUT_SALT) % 4;
}

/** De coordenadas locales (a de −3 a 3, b de −4 a 4; el porche en b = −4) a las del mundo. */
function toWorld(turn: number, ox: number, oz: number, a: number, b: number): [number, number] {
  switch (turn) {
    case 1:
      return [ox - b, oz + a];
    case 2:
      return [ox - a, oz - b];
    case 3:
      return [ox + b, oz - a];
    default:
      return [ox + a, oz + b];
  }
}

/** De las del mundo a las locales (lo contrario de toWorld). */
function toLocal(turn: number, ox: number, oz: number, x: number, z: number): [number, number] {
  const dx = x - ox, dz = z - oz;
  switch (turn) {
    case 1:
      return [dz, -dx];
    case 2:
      return [-dx, -dz];
    case 3:
      return [-dz, dx];
    default:
      return [dx, dz];
  }
}

export function buildSwampHut(c: Canvas, s: VillageStart, gen: TerrainGenerator): void {
  const turn = turnOf(gen.seed, s.x, s.z);
  const y0 = s.y;
  // Local de Minecraft: u 0..6 (a = u − 3), v 0..8 (b = v − 4), h sobre el origen.
  const put = (u: number, h: number, v: number, id: number) => {
    const [x, z] = toWorld(turn, s.x, s.z, u - 3, v - 4);
    c.set(x, y0 + h, z, id);
  };
  const box = (u0: number, h0: number, v0: number, u1: number, h1: number, v1: number, id: number) => {
    for (let h = h0; h <= h1; h++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) put(u, h, v, id);
  };
  // Hueco para la casa (árboles y juncos fuera) sin tocar el agua de debajo.
  for (let v = 0; v <= 8; v++) {
    for (let u = 0; u <= 6; u++) {
      const [x, z] = toWorld(turn, s.x, s.z, u - 3, v - 4);
      c.clearAbove(x, y0 + 1, z, HEIGHT + 2);
    }
  }
  const stairs = (dir: number) => stateOf(STAIRS.spruce, { facing: (dir + turn) % 4, half: 0 });
  box(1, 1, 1, 5, 1, 7, SPRUCE_PLANKS); // suelo
  box(1, 4, 2, 5, 4, 7, SPRUCE_PLANKS); // techo
  box(2, 1, 0, 4, 1, 0, SPRUCE_PLANKS); // porche
  box(2, 2, 2, 3, 3, 2, SPRUCE_PLANKS); // fachada (la puerta queda en u = 4)
  box(1, 2, 3, 1, 3, 6, SPRUCE_PLANKS);
  box(5, 2, 3, 5, 3, 6, SPRUCE_PLANKS);
  box(2, 2, 7, 4, 3, 7, SPRUCE_PLANKS);
  for (const [u, v] of [[1, 2], [5, 2], [1, 7], [5, 7]]) box(u, 0, v, u, 3, v, OAK_LOG);
  box(2, 2, 3, 4, 3, 6, AIR); // interior
  box(4, 2, 2, 4, 3, 2, AIR); // puerta
  const fence = FENCES.oak;
  put(2, 3, 2, fence);
  put(3, 3, 7, fence);
  put(1, 3, 4, AIR);
  put(5, 3, 4, AIR);
  put(5, 3, 5, AIR);
  put(1, 3, 5, potWith(RED_MUSHROOM) || AIR);
  put(3, 2, 6, CRAFTING_TABLE);
  put(4, 2, 6, CAULDRON);
  put(1, 2, 1, fence);
  put(5, 2, 1, fence);
  // Reborde del tejado: escaleras con la parte alta hacia fuera (0 norte, 1 este, 2 sur, 3 oeste en local).
  box(0, 4, 1, 6, 4, 1, stairs(0));
  box(0, 4, 2, 0, 4, 7, stairs(3));
  box(6, 4, 2, 6, 4, 7, stairs(1));
  box(0, 4, 8, 6, 4, 8, stairs(2));
  // Los cuatro postes bajan hasta el fondo (a través del agua).
  for (const [u, v] of [[1, 2], [5, 2], [1, 7], [5, 7]]) {
    const [x, z] = toWorld(turn, s.x, s.z, u - 3, v - 4);
    c.foundation(x, y0 - 1, z, OAK_LOG);
  }
  // La bruja y su gato negro, dentro junto al caldero (una sola vez, con el chunk).
  const [sx, sy, sz] = swampHutSpawnSpot(gen.seed, s.x, s.y, s.z);
  c.mob?.(MOB_WITCH, sx, sy, sz);
  c.mob?.(MOB_CAT, sx, sy, sz, CAT_SKINS.indexOf('negro'));
}

/** Dónde aparecen la bruja y el gato de la cabaña (dentro, junto al caldero): pies [x, y, z]. */
export function swampHutSpawnSpot(seed: number, ox: number, oy: number, oz: number): [number, number, number] {
  const [x, z] = toWorld(turnOf(seed, ox, oz), ox, oz, 2 - 3, 5 - 4);
  return [x + 0.5, oy + 2, z + 0.5];
}

/**
 * ¿Está (x, y, z) dentro de la caja de la cabaña con origen (ox, oy, oz)? La caja va del origen hasta 6
 * bloques más arriba (7 × 7 × 9, como en Minecraft).
 */
export function inHutBox(seed: number, ox: number, oy: number, oz: number, x: number, y: number, z: number): boolean {
  if (y < oy || y >= oy + HEIGHT) return false;
  const [a, b] = toLocal(turnOf(seed, ox, oz), ox, oz, Math.floor(x), Math.floor(z));
  return Math.abs(a) <= 3 && Math.abs(b) <= 4;
}
