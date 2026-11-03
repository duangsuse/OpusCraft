// Constantes globales del mundo, compartidas por cliente, workers y servidor.

export const CHUNK_SIZE = 16;
export const CHUNK_SHIFT = 4;
export const CHUNK_MASK = 15;
/**
 * Altura del mundo como en Minecraft 1.18+: de y = −64 (lecho de roca) a y = 319. Las columnas de
 * chunk guardan WORLD_HEIGHT filas; la fila 0 es y = MIN_Y.
 */
export const MIN_Y = -64;
export const MAX_Y = 320;
export const WORLD_HEIGHT = MAX_Y - MIN_Y;
/** Por debajo de esta altura el vacío hace daño (y las criaturas desaparecen). */
export const VOID_Y = MIN_Y - 64;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;

/** El agua llena las celdas con y < SEA_LEVEL (la superficie queda en y = SEA_LEVEL). */
export const SEA_LEVEL = 63;

/** Duración de un día completo en segundos reales (como en Minecraft: 20 minutos). */
export const DAY_LENGTH_SECONDS = 1200;

export const PLAYER_HEIGHT = 1.8;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_SNEAK_EYE_HEIGHT = 1.32;

/** Coordenada horizontal máxima permitida (en bloques) para ediciones. */
export const WORLD_LIMIT = 1_000_000;

/** Identificadores de bloque de 16 bits (estados incluidos). Los ids 256–1023 son objetos. */
export type BlockArray = Uint16Array;
export const MAX_BLOCK_ID = 8192;
/** Primer id de los bloques nuevos (los 0–255 antiguos no cambian; 256–1023 son objetos). */
export const FIRST_EXTENDED_BLOCK = 1024;

/** Índice de un bloque dentro de una columna de chunk (x, z en 0..15, y la altura del mundo). */
export function blockIndex(x: number, y: number, z: number): number {
  return ((y - MIN_Y) << 8) | (z << 4) | x;
}

/** Altura del mundo de un índice de columna. */
export function indexY(i: number): number {
  return (i >> 8) + MIN_Y;
}

/** ¿Está la altura dentro del mundo? */
export function inWorldY(y: number): boolean {
  return y >= MIN_Y && y < MAX_Y;
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

/** Hash entero rápido y determinista (para decoración procedural). */
export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash3(x: number, y: number, z: number, seed: number): number {
  return hash2(x ^ Math.imul(y | 0, 0x3c6ef372), z, seed);
}

/** Convierte un hash de 32 bits en un float en [0, 1). */
export function hashToFloat(h: number): number {
  return h / 4294967296;
}
