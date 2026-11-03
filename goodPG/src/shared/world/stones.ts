// Fase 6.5 (piedras): piedras que salen solas en el mundo.
//  - Barro en los pantanos: el fondo de las charcas y parte de la orilla encharcada.
//  - Cuevas de azufre (Minecraft 26.3): zonas del subsuelo donde la roca se ordena en franjas
//    onduladas de azufre y cinabrio (en Minecraft es un bioma de cueva con sus propias franjas).
// Usa su propio generador aleatorio (hash de la posición) para no alterar el resto del terreno.
import { STONE, DEEPSLATE, TUFF, GRANITE, DIORITE, ANDESITE, DIRT, GRAVEL, GRASS, CLAY, SAND, WATER, MUD, SULFUR, CINNABAR } from '../blocks';
import { MIN_Y, SEA_LEVEL, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { BIOME_SWAMP, BIOME_MANGROVE_SWAMP, baseBiome } from './biomeIds';

/** Tamaño de las celdas en las que puede haber (o no) una cueva de azufre. */
const SULFUR_CELL = 128;
/** Parte de las celdas que tienen cueva de azufre. */
const SULFUR_CHANCE = 0.14;
/** Alturas entre las que están las cuevas de azufre. */
export const SULFUR_MIN_Y = -44;
export const SULFUR_MAX_Y = 24;

/** Ruido de valor suave (0..1) a partir de hashes en una retícula de `cell` bloques. */
function valueNoise(x: number, z: number, cell: number, seed: number): number {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number) => hashToFloat(hash2(a, b, seed));
  const top = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * tx;
  const bot = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * tx;
  return top + (bot - top) * tz;
}

export interface SulfurZone {
  x: number;
  z: number;
  radius: number;
}

/** Cueva de azufre de la celda que contiene (x, z), o null si esa celda no tiene. */
export function sulfurZoneAt(seed: number, x: number, z: number): SulfurZone | null {
  const gx = Math.floor(x / SULFUR_CELL), gz = Math.floor(z / SULFUR_CELL);
  const s = (seed ^ 0x5a1f0c) | 0;
  if (hashToFloat(hash2(gx, gz, s)) >= SULFUR_CHANCE) return null;
  const jx = hashToFloat(hash2(gx, gz, s + 1)), jz = hashToFloat(hash2(gx, gz, s + 2));
  const radius = 34 + Math.floor(hashToFloat(hash2(gx, gz, s + 3)) * 17);
  // Margen de medio chunk: así la decide siempre la celda del centro de cualquier chunk que la toque.
  const margin = radius + 9;
  return {
    x: gx * SULFUR_CELL + margin + jx * (SULFUR_CELL - 2 * margin),
    z: gz * SULFUR_CELL + margin + jz * (SULFUR_CELL - 2 * margin),
    radius,
  };
}

/** Rocas que las franjas de azufre sustituyen (las menas se quedan). */
const HOST = new Set([STONE, DEEPSLATE, TUFF, GRANITE, DIORITE, ANDESITE, DIRT, GRAVEL]);

/** Franja de una roca de las cuevas de azufre: SULFUR, CINNABAR o 0 (se queda la roca). */
export function sulfurBand(seed: number, x: number, y: number, z: number): number {
  const wave = 2.5 * Math.sin(x * 0.11 + z * 0.04) + 2.5 * Math.cos(z * 0.13 - x * 0.05);
  const g = y + wave + 1.5 * valueNoise(x, z, 9, seed ^ 0x77b1);
  const band = ((Math.floor(g / 2) % 6) + 6) % 6;
  return band <= 1 ? SULFUR : band === 3 || band === 4 ? CINNABAR : 0;
}

function placeSulfur(blocks: Uint16Array, x0: number, z0: number, seed: number, caveBiome: number): void {
  if (caveBiome !== 0) return; // no se mezcla con las cuevas frondosas ni con las de goteo
  const zone = sulfurZoneAt(seed, x0 + 8, z0 + 8);
  if (!zone) return;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const d = Math.hypot(wx - zone.x, wz - zone.z) / zone.radius;
      if (d >= 1) continue;
      for (let y = Math.max(SULFUR_MIN_Y, MIN_Y + 1); y <= SULFUR_MAX_Y; y++) {
        // Bordes deshilachados: cerca del límite (en horizontal o en altura) sólo una parte cambia.
        const edge = Math.max(d, Math.abs(y - (SULFUR_MIN_Y + SULFUR_MAX_Y) / 2) / ((SULFUR_MAX_Y - SULFUR_MIN_Y) / 2));
        if (edge > 0.8 && hashToFloat(hash3(wx, y, wz, seed ^ 0x3c3)) < (edge - 0.8) * 5) continue;
        const i = blockIndex(lx, y, lz);
        if (!HOST.has(blocks[i])) continue;
        const b = sulfurBand(seed, wx, y, wz);
        if (b) blocks[i] = b;
      }
    }
  }
}

/** Barro en los pantanos: el fondo de las charcas y parte de la orilla encharcada. */
function placeMud(
  blocks: Uint16Array, x0: number, z0: number, seed: number, biomes: readonly { biome: number }[], tops: Int16Array,
): void {
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const b = biomes[lz * 16 + lx].biome;
      if (baseBiome(b) !== BIOME_SWAMP) continue;
      // Fase 7.6: el pantano de manglares es casi todo barro.
      const n = b === BIOME_MANGROVE_SWAMP ? 1 : valueNoise(x0 + lx, z0 + lz, 6, seed ^ 0x6d0d);
      let y = tops[lz * 16 + lx];
      let underwater = false;
      while (y > MIN_Y + 1 && blocks[blockIndex(lx, y, lz)] === WATER) {
        y--;
        underwater = true;
      }
      if (!underwater && y > SEA_LEVEL) continue;
      if (n < (underwater ? 0.35 : 0.58)) continue;
      for (let k = 0; k < 2; k++) {
        const i = blockIndex(lx, y - k, lz);
        const b = blocks[i];
        if (b === DIRT || b === GRASS || b === CLAY || b === SAND || b === GRAVEL) blocks[i] = MUD;
        else break;
      }
    }
  }
}

/** Piedras que aparecen solas en un chunk ya excavado (después de las menas). */
export function placeStones(
  blocks: Uint16Array, x0: number, z0: number, seed: number, biomes: readonly { biome: number }[], tops: Int16Array,
  caveBiome: number,
): void {
  placeMud(blocks, x0, z0, seed, biomes, tops);
  placeSulfur(blocks, x0, z0, seed, caveBiome);
}
