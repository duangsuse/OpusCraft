// World layout constants shared by main thread and workers.
export const MIN_Y = -64;
export const HEIGHT = 384;            // world y in [MIN_Y, MIN_Y + HEIGHT)
export const MAX_Y = MIN_Y + HEIGHT;  // exclusive
export const SEA_LEVEL = 63;
export const SECTIONS = HEIGHT / 16;
export const CHUNK_VOL = 16 * 16 * HEIGHT;

// Chunk SharedArrayBuffer layout: blocks (Uint16 * CHUNK_VOL) | biomes (Uint8 * 256) | heightmap (Int16 * 256, internal y index of top non-air, -1 = none)
export const BIOME_OFF = CHUNK_VOL * 2;
export const HEIGHTMAP_OFF = BIOME_OFF + 256;
export const CHUNK_BYTES = HEIGHTMAP_OFF + 512;

// index of a block in a chunk; yi = y - MIN_Y
export const cidx = (x, yi, z) => (yi * 16 + z) * 16 + x;
export const ckey = (cx, cz) => cx + ',' + cz;

export const TICKS_PER_SECOND = 20;
export const DAY_LENGTH = 24000;
