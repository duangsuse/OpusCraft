// Fase 6.5 (materiales): lo que se añade al generar cada chunk (terrain.ts llama a decorateMaterials
// al final, después de la nieve):
// - Parches de podsol (y algo de tierra gruesa) en las taigas.
// - Nieve polvo en las montañas nevadas: hoyos de 1 a 3 bloques donde la cumbre es de nieve.
// - Pizarra profunda infestada en vetas por la capa de pizarra profunda.
// Además, la columna de tierra enraizada bajo las azaleas (oceanDecor.ts la pide al plantar una) y los
// ladrillos (a veces infestados) del sótano de los iglús (structures.ts).
// Todo es determinista (semilla y posición) y se queda dentro del chunk.
import {
  AIR, GRASS, DIRT, STONE, GRAVEL, SNOW_BLOCK, SNOWY_GRASS, DEEPSLATE, STONE_BRICKS, MOSSY_STONE_BRICKS,
  CRACKED_STONE_BRICKS, INFESTED_STONE_BRICKS, PODZOL, COARSE_DIRT, ROOTED_DIRT, POWDER_SNOW, HANGING_ROOTS, INFESTED_DEEPSLATE,
  INFESTED_MOSSY_STONE_BRICKS, INFESTED_CRACKED_STONE_BRICKS, BLOCK_OPAQUE, isSnowLayer,
} from '../blocks';
import { MIN_Y, MAX_Y, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { Simplex, mulberry32 } from './noise';
import { BIOME_TAIGA, BIOME_SNOWY_PEAKS, BIOME_MOUNTAINS, BIOME_GROVE, BIOME_OLD_GROWTH_PINE_TAIGA, BIOME_OLD_GROWTH_SPRUCE_TAIGA, baseBiome } from './biomeIds';
import type { ColumnInfo } from './terrain';

/** Distancia en el índice entre una fila y la siguiente. */
const ROW = 256;

const NOISES = new Map<number, { soil: Simplex; powder: Simplex }>();
function noisesFor(seed: number): { soil: Simplex; powder: Simplex } {
  let n = NOISES.get(seed);
  if (!n) {
    n = { soil: new Simplex(seed ^ 0x9d20), powder: new Simplex(seed ^ 0x5a0f) };
    NOISES.set(seed, n);
  }
  return n;
}

/** Decoración de los materiales de un chunk ya generado (ver la cabecera). */
export function decorateMaterials(
  seed: number, blocks: Uint16Array, tops: Int16Array, infos: ColumnInfo[], cx: number, cz: number,
): void {
  const nz = noisesFor(seed);
  const x0 = cx * 16, z0 = cz * 16;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      // Fase 7.6: por su bioma base (las taigas viejas son taigas; los picos, laderas y colinas); la
      // arboleda nevada también tiene nieve polvo.
      const specific = infos[lz * 16 + lx].biome;
      const biome = specific === BIOME_GROVE ? BIOME_SNOWY_PEAKS : baseBiome(specific);
      if (biome !== BIOME_TAIGA && biome !== BIOME_SNOWY_PEAKS && biome !== BIOME_MOUNTAINS) continue;
      // Suelo de la columna (antes de los árboles).
      const y = tops[lz * 16 + lx];
      if (y <= MIN_Y + 3 || y >= MAX_Y - 2) continue;
      const i = blockIndex(lx, y, lz);
      const top = blocks[i];
      const wx = x0 + lx, wz = z0 + lz;
      if (biome === BIOME_TAIGA) {
        if (top !== GRASS) continue;
        const v = nz.soil.noise2(wx / 22, wz / 22);
        // Las taigas viejas tienen mucho más podsol y tierra gruesa (como en Minecraft).
        const old = specific === BIOME_OLD_GROWTH_PINE_TAIGA || specific === BIOME_OLD_GROWTH_SPRUCE_TAIGA;
        if (old && v < -0.2) blocks[i] = COARSE_DIRT;
        else if (v > (old ? -0.2 : 0.38)) blocks[i] = PODZOL;
        else if (v < -0.62 && hashToFloat(hash2(wx, wz, seed ^ 0xc0a5)) < 0.6) blocks[i] = COARSE_DIRT;
        continue;
      }
      // Montañas nevadas: hoyos de nieve polvo en las cumbres de nieve.
      if (top !== SNOW_BLOCK && top !== SNOWY_GRASS) continue;
      const v = nz.powder.noise2(wx / 14, wz / 14);
      if (v < 0.42) continue;
      const depth = v > 0.62 ? 3 : v > 0.52 ? 2 : 1;
      if (isSnowLayer(blocks[i + ROW])) blocks[i + ROW] = AIR;
      for (let k = 0; k < depth; k++) {
        const b = blocks[i - k * ROW];
        if (b !== SNOW_BLOCK && b !== SNOWY_GRASS && b !== DIRT && b !== STONE && b !== GRAVEL) break;
        blocks[i - k * ROW] = POWDER_SNOW;
      }
    }
  }
  placeInfestedDeepslate(seed, blocks, cx, cz);
}

/** Vetas de pizarra profunda infestada (como la piedra infestada: hasta 9 bloques cada una). */
function placeInfestedDeepslate(seed: number, blocks: Uint16Array, cx: number, cz: number): void {
  const rng = mulberry32(hash2(cx, cz, (seed ^ 0x1d5e7a) | 0));
  for (let n = 0; n < 3; n++) {
    let x = Math.floor(rng() * 16), y = MIN_Y + 6 + Math.floor(rng() * 60), z = Math.floor(rng() * 16);
    for (let s = 0; s < 9; s++) {
      if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y && y < 0) {
        const i = blockIndex(x, y, z);
        if (blocks[i] === DEEPSLATE) blocks[i] = INFESTED_DEEPSLATE;
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

/**
 * Tierra enraizada bajo una azalea: desde el suelo (`top`) hacia abajo hasta la cueva frondosa (como
 * mucho 24 bloques), y raíces colgantes en el techo de la cueva, debajo de la última.
 */
export function rootColumn(blocks: Uint16Array, lx: number, top: number, lz: number): void {
  let y = top;
  for (let k = 0; k < 24 && y > MIN_Y + 1; k++, y--) {
    const i = blockIndex(lx, y, lz);
    const b = blocks[i];
    if (b === AIR) break;
    if (k > 0 && !BLOCK_OPAQUE[b]) return; // agua, lava u otra cosa: se corta ahí
    blocks[i] = ROOTED_DIRT;
  }
  if (y > MIN_Y + 1 && blocks[blockIndex(lx, y, lz)] === AIR) blocks[blockIndex(lx, y, lz)] = HANGING_ROOTS;
}

/** Ladrillo del sótano de un iglú: normales, musgosos o agrietados, y alguno infestado (como en Minecraft). */
export function iglooBrick(x: number, y: number, z: number, seed: number): number {
  const k = hash3(x, y, z, seed ^ 0x16100);
  const kind = k % 10 < 6 ? 0 : k % 10 < 8 ? 1 : 2;
  const infested = ((k >>> 8) & 7) === 0;
  if (kind === 1) return infested ? INFESTED_MOSSY_STONE_BRICKS : MOSSY_STONE_BRICKS;
  if (kind === 2) return infested ? INFESTED_CRACKED_STONE_BRICKS : CRACKED_STONE_BRICKS;
  return infested ? INFESTED_STONE_BRICKS : STONE_BRICKS;
}
