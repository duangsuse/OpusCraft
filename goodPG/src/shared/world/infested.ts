// Fase 6 (monstruos): piedra infestada en las montañas (como en Minecraft, vetas de hasta 9 bloques
// por debajo de y = 64) y "chunks de slime" (uno de cada diez, según la semilla), donde aparecen
// slimes bajo y = 40 aunque haya luz.
import { STONE, INFESTED_STONE } from '../blocks';
import { MIN_Y, blockIndex, hash2 } from '../constants';
import { mulberry32 } from './noise';
import { BIOME_MOUNTAINS, BIOME_SNOWY_PEAKS, baseBiome } from './biomeIds';

/** Por debajo de esta altura aparecen los slimes de los chunks de slime. */
export const SLIME_CHUNK_MAX_Y = 40;

/** ¿Es un chunk de slime? (determinista: depende sólo de la semilla y del chunk). */
export function isSlimeChunk(seed: number, cx: number, cz: number): boolean {
  return hash2(cx, cz, (seed ^ 0x3ad8025f) | 0) % 10 === 0;
}

/**
 * Cambia parte de la piedra de un chunk de montaña por piedra infestada. Usa su propio generador
 * aleatorio para no alterar el resto del terreno.
 */
export function placeInfested(blocks: Uint16Array, cx: number, cz: number, seed: number, biome: number): void {
  const base = baseBiome(biome); // Fase 7.6: también los picos y las colinas nuevas
  if (base !== BIOME_MOUNTAINS && base !== BIOME_SNOWY_PEAKS) return;
  const rng = mulberry32(hash2(cx, cz, (seed ^ 0x51f7e5) | 0));
  for (let n = 0; n < 7; n++) {
    let x = Math.floor(rng() * 16), y = Math.floor(rng() * 64), z = Math.floor(rng() * 16);
    for (let s = 0; s < 9; s++) {
      if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y) {
        const i = blockIndex(x, y, z);
        if (blocks[i] === STONE) blocks[i] = INFESTED_STONE;
      }
      const dir = Math.floor(rng() * 6);
      if (dir === 0) x++;
      else if (dir === 1) x--;
      else if (dir === 2) y++;
      else if (dir === 3) y--;
      else if (dir === 4) z++;
      else z--;
    }
  }
}
