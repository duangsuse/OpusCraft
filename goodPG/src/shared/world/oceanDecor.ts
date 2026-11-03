// Fase 6.5 (océano y plantas): lo que se añade al generar cada chunk, después de los árboles y las
// estructuras (terrain.ts sólo llama a decorate65):
// - Océanos: arrecifes de coral en los cálidos (montículos de bloques de coral con corales, gorgonias
//   también en las paredes, y pepinos de mar), bosques de algas en los normales, fríos y profundos,
//   y praderas de plantas marinas por los fondos (pocas en los helados).
// - Tierra: girasoles en las llanuras, lilas, rosales y peonías en los bosques, arbustos de bayas
//   dulces y helechos grandes en las taigas, hierba alta en llanuras, sabanas, praderas y junglas, y
//   azaleas (árboles) encima de las cuevas frondosas.
// - Cuevas frondosas: plantaformas grandes y pequeñas sobre el musgo, flores de esporas y raíces
//   colgantes en el techo; liquen luminoso por las paredes de todas las cuevas.
// Todo es determinista (semilla y posición) y se queda dentro del chunk.
import {
  AIR, WATER, ICE, GRASS, SNOWY_GRASS, SHORT_GRASS, FERN, OAK_LOG, MOSS_BLOCK, BLOCK_OPAQUE, BLOCK_REPLACEABLE,
  BLOCK_RENDER, R_CROSS, CORAL_TYPES, CORALS, KELP_TOP, KELP_STEM, SEAGRASS_SHORT, TALL_SEAGRASS_LOWER, TALL_SEAGRASS_UPPER,
  SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TALL_GRASS, LARGE_FERN, SWEET_BERRY_BUSH, AZALEA_LEAVES, FLOWERING_AZALEA_LEAVES,
  BIG_DRIPLEAF, BIG_DRIPLEAF_STEM, SMALL_DRIPLEAF, GLOW_LICHEN, HANGING_ROOTS, SPORE_BLOSSOM, seaPickleBlock, stateOf,
  isLeaves,
} from '../blocks';
import { SEA_LEVEL, MIN_Y, MAX_Y, blockIndex, hash2, hash3, hashToFloat } from '../constants';
import { DIR_X, DIR_Z } from '../blockModels';
import { Simplex } from './noise';
import {
  BIOME_OCEAN, BIOME_FROZEN_OCEAN, BIOME_WARM_OCEAN, BIOME_COLD_OCEAN, BIOME_DEEP_OCEAN, BIOME_PLAINS, BIOME_FOREST,
  BIOME_BIRCH_FOREST, BIOME_DARK_FOREST, BIOME_TAIGA, BIOME_SNOWY, BIOME_JUNGLE, BIOME_SAVANNA, BIOME_MEADOW,
  // Fase 7.6: los océanos nuevos y las variantes con flores.
  BIOME_DEEP_FROZEN_OCEAN, BIOME_DEEP_COLD_OCEAN, BIOME_SUNFLOWER_PLAINS, BIOME_FLOWER_FOREST, isOceanBiome, baseBiome,
} from './biomeIds';
import type { TerrainGenerator, ColumnInfo } from './terrain';
import { rootColumn } from './materialDecor'; // Fase 6.5 (materiales)
import { PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN } from '../blocks'; // Fase 7.5 (océano)

/** Fase 7.5 (océano): sobre los monumentos no crecen algas ni plantas marinas. */
const MONUMENT_SURFACE: ReadonlySet<number> = new Set([PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN]);

type SetBlock = (x: number, y: number, z: number, id: number, force: boolean) => void;

/** Distancia en el índice entre una fila y la siguiente. */
const ROW = 256;

interface Noises {
  reef: Simplex;
  kind: Simplex;
  kelp: Simplex;
  patch: Simplex;
}
const NOISES = new Map<number, Noises>();
function noisesFor(seed: number): Noises {
  let n = NOISES.get(seed);
  if (!n) {
    n = {
      reef: new Simplex(seed ^ 0x2eef),
      kind: new Simplex(seed ^ 0xc0a1),
      kelp: new Simplex(seed ^ 0x6e1b),
      patch: new Simplex(seed ^ 0xf10e),
    };
    NOISES.set(seed, n);
  }
  return n;
}

/** Decoración de la fase 6.5 de un chunk ya generado (ver la cabecera). */
export function decorate65(
  gen: TerrainGenerator, blocks: Uint16Array, tops: Int16Array, infos: ColumnInfo[], cx: number, cz: number,
): void {
  const nz = noisesFor(gen.seed);
  decorateOcean(gen.seed, nz, blocks, infos, cx, cz);
  decorateLand(gen, nz, blocks, tops, infos, cx, cz);
  decorateCaves65(gen, blocks, tops, cx, cz);
}

// ------------------------------------------------------------------ océanos

function decorateOcean(seed: number, nz: Noises, blocks: Uint16Array, infos: ColumnInfo[], cx: number, cz: number): void {
  const x0 = cx * 16, z0 = cz * 16;
  /** Bloques de coral puestos (para las gorgonias de pared): [lx, y, lz, tipo]. */
  const reefBlocks: [number, number, number, number][] = [];
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const biome = infos[lz * 16 + lx].biome;
      if (!isOceanBiome(biome)) continue; // Fase 7.6: también los templados y los profundos
      let y = SEA_LEVEL - 1;
      if (blocks[blockIndex(lx, y, lz)] === ICE) y--;
      if (blocks[blockIndex(lx, y, lz)] !== WATER) continue;
      const surface = y;
      while (y > MIN_Y + 2 && blocks[blockIndex(lx, y, lz)] === WATER) y--;
      const floor = blocks[blockIndex(lx, y, lz)];
      if (!BLOCK_OPAQUE[floor] || MONUMENT_SURFACE.has(floor)) continue; // Fase 7.5 (océano)
      const fy = y + 1; // primera celda de agua sobre el fondo
      const depth = surface - y;
      const wx = x0 + lx, wz = z0 + lz;
      const r = hashToFloat(hash2(wx, wz, seed ^ 0x0cea));
      const r2 = hashToFloat(hash2(wx, wz, seed ^ 0x5eaf));
      const at = (yy: number) => blockIndex(lx, yy, lz);
      const water = (yy: number) => yy <= surface && blocks[at(yy)] === WATER;
      const seagrass = (tallChance: number) => {
        if (depth >= 2 && r2 < tallChance && water(fy + 1)) {
          blocks[at(fy)] = TALL_SEAGRASS_LOWER;
          blocks[at(fy + 1)] = TALL_SEAGRASS_UPPER;
        } else blocks[at(fy)] = SEAGRASS_SHORT;
      };
      if (biome === BIOME_WARM_OCEAN) {
        const reef = depth >= 3 && nz.reef.noise2(wx / 48, wz / 48) > -0.15;
        const type = Math.min(4, Math.floor((nz.kind.noise2(wx / 11, wz / 11) * 0.5 + 0.5) * 5));
        const set = CORALS[CORAL_TYPES[type]];
        if (reef && r < 0.16 && depth >= 4) {
          // Montículo de bloques de coral con algo encima.
          const h = Math.min(depth - 2, 1 + Math.floor(r2 * 3));
          let k = 0;
          while (k < h && water(fy + k)) {
            blocks[at(fy + k)] = set.block;
            reefBlocks.push([lx, fy + k, lz, type]);
            k++;
          }
          const topY = fy + k;
          if (k > 0 && water(topY)) {
            const pick = hashToFloat(hash3(wx, topY, wz, seed ^ 0x7a1));
            blocks[at(topY)] = pick < 0.4 ? stateOf(set.coral, { water: 1 }) : pick < 0.8 ? stateOf(set.fan, { water: 1 })
              : seaPickleBlock(1 + Math.floor(r2 * 4), true);
          }
        } else if (reef && r < 0.45) {
          blocks[at(fy)] = stateOf(r2 < 0.5 ? set.coral : set.fan, { water: 1 });
        } else if (r < (reef ? 0.62 : 0.32)) {
          seagrass(0.25);
        } else if (r < (reef ? 0.64 : 0.325)) {
          blocks[at(fy)] = seaPickleBlock(1 + Math.floor(r2 * 4), true);
        }
      } else if (biome === BIOME_FROZEN_OCEAN || biome === BIOME_DEEP_FROZEN_OCEAN) {
        if (r < 0.06) blocks[at(fy)] = SEAGRASS_SHORT;
      } else {
        const forest = depth >= 3 && nz.kelp.noise2(wx / 40, wz / 40) > (biome === BIOME_COLD_OCEAN || biome === BIOME_DEEP_COLD_OCEAN ? -0.1 : 0.05);
        if (forest && r < 0.5) {
          // Alga de varios bloques: tallos y una punta (a veces llega a la superficie).
          const h = Math.max(1, Math.min(depth, 2 + Math.floor(r2 * Math.min(depth, 16))));
          let k = 0;
          while (k < h && water(fy + k)) {
            blocks[at(fy + k)] = KELP_STEM;
            k++;
          }
          if (k > 0) blocks[at(fy + k - 1)] = KELP_TOP;
        } else if (r < (forest ? 0.7 : 0.35)) {
          seagrass(0.3);
        }
      }
    }
  }
  // Gorgonias en las paredes de los montículos.
  for (const [lx, y, lz, type] of reefBlocks) {
    for (let d = 0; d < 4; d++) {
      const nx = lx + DIR_X[d], nzz = lz + DIR_Z[d];
      if (nx < 0 || nx > 15 || nzz < 0 || nzz > 15) continue;
      const i = blockIndex(nx, y, nzz);
      if (blocks[i] !== WATER) continue;
      if (hashToFloat(hash3(x0 + nx, y, z0 + nzz, seed ^ 0xfa4 ^ d)) > 0.22) continue;
      blocks[i] = stateOf(CORALS[CORAL_TYPES[type]].wallFan, { water: 1, facing: d });
    }
  }
}

// ------------------------------------------------------------------ tierra

function decorateLand(
  gen: TerrainGenerator, nz: Noises, blocks: Uint16Array, tops: Int16Array, infos: ColumnInfo[], cx: number, cz: number,
): void {
  const seed = gen.seed;
  const x0 = cx * 16, z0 = cz * 16;
  const setLocal: SetBlock = (x, y, z, id, force) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y <= MIN_Y || y >= MAX_Y) return;
    const i = blockIndex(lx, y, lz);
    const cur = blocks[i];
    if (cur === AIR || (force && (BLOCK_REPLACEABLE[cur] || BLOCK_RENDER[cur] === R_CROSS || isLeaves(cur)))) blocks[i] = id;
  };
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const top = tops[lz * 16 + lx];
      if (top <= MIN_Y + 1 || top >= MAX_Y - 8) continue;
      const ground = blocks[blockIndex(lx, top, lz)];
      if (ground !== GRASS && ground !== SNOWY_GRASS) continue;
      const a1 = blockIndex(lx, top + 1, lz), a2 = a1 + ROW;
      const cur = blocks[a1];
      if (cur !== AIR && cur !== SHORT_GRASS && cur !== FERN) continue;
      const wx = x0 + lx, wz = z0 + lz;
      const biome = infos[lz * 16 + lx].biome;
      const r = hashToFloat(hash2(wx, wz, seed ^ 0x65f1));
      const r2 = hashToFloat(hash2(wx, wz, seed ^ 0x65f2));
      const tall = (id: number): boolean => {
        if (blocks[a2] !== AIR) return false;
        blocks[a1] = id;
        blocks[a2] = id + 1;
        return true;
      };
      // Azaleas encima de las cuevas frondosas (el árbol entero cabe en el chunk).
      if (ground === GRASS && cur === AIR && lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13 && r2 < 0.006 && gen.caveBiomeAt(wx, wz) === 1) {
        azaleaTree(wx, top + 1, wz, r, setLocal);
        rootColumn(blocks, lx, top, lz); // Fase 6.5 (materiales): tierra enraizada hasta la cueva
        continue;
      }
      const patch = nz.patch.noise2(wx / 34, wz / 34);
      // Fase 7.6: la llanura de girasoles y el bosque de flores, llenos; los demás, como su bioma base.
      if (biome === BIOME_SUNFLOWER_PLAINS && r < 0.22 && tall(SUNFLOWER)) continue;
      if (biome === BIOME_FLOWER_FOREST && r < 0.12 && tall([LILAC, ROSE_BUSH, PEONY][Math.floor(r2 * 3)])) continue;
      switch (baseBiome(biome)) {
        case BIOME_PLAINS:
          if (patch > 0.5 && r < 0.14) tall(SUNFLOWER);
          else if (cur === SHORT_GRASS && r < 0.2) tall(TALL_GRASS);
          break;
        case BIOME_FOREST:
        case BIOME_BIRCH_FOREST:
        case BIOME_DARK_FOREST:
          if (patch > 0.45 && r < 0.07) tall([LILAC, ROSE_BUSH, PEONY][Math.floor(r2 * 3)]);
          else if (cur === SHORT_GRASS && r < 0.14) tall(TALL_GRASS);
          break;
        case BIOME_TAIGA:
        case BIOME_SNOWY:
          if (patch > 0.3 && r < 0.035) blocks[a1] = SWEET_BERRY_BUSH + 1 + Math.floor(r2 * 3);
          else if (cur === FERN && r < 0.35) tall(LARGE_FERN);
          else if (cur === SHORT_GRASS && r < 0.1) tall(TALL_GRASS);
          break;
        case BIOME_JUNGLE:
          if (cur === FERN && r < 0.35) tall(LARGE_FERN);
          else if (cur === SHORT_GRASS && r < 0.2) tall(TALL_GRASS);
          break;
        case BIOME_SAVANNA:
          if (cur === SHORT_GRASS && r < 0.25) tall(TALL_GRASS);
          break;
        case BIOME_MEADOW:
          if (cur === SHORT_GRASS && r < 0.18) tall(TALL_GRASS);
          break;
      }
    }
  }
}

/**
 * Azalea: tronco de roble corto y una copa redonda de hojas de azalea (algunas floridas). `y` es el
 * primer bloque del tronco; `set` recibe `force` = true para el tronco.
 */
export function azaleaTree(x: number, y: number, z: number, r: number, set: SetBlock): void {
  const h = 4 + Math.floor(r * 2);
  const top = y + h - 1;
  for (let k = 0; k < h; k++) set(x, y + k, z, OAK_LOG, true);
  for (let dy = -1; dy <= 1; dy++) {
    const rad = dy === 1 ? 1 : 2;
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx === 0 && dz === 0 && dy < 1) continue;
        // Esquinas recortadas (a veces), para que no sea un cubo.
        const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
        const hh = hash3(x + dx, top + dy, z + dz, 0xa2a1);
        if (corner && (hh & 3) !== 0) continue;
        set(x + dx, top + dy, z + dz, (hh >>> 4) % 10 < 3 ? FLOWERING_AZALEA_LEAVES : AZALEA_LEAVES, false);
      }
    }
  }
  set(x, top + 2, z, AZALEA_LEAVES, false);
}

// ------------------------------------------------------------------ cuevas

function decorateCaves65(gen: TerrainGenerator, blocks: Uint16Array, tops: Int16Array, cx: number, cz: number): void {
  const seed = gen.seed;
  const x0 = cx * 16, z0 = cz * 16;
  const opaque = (b: number) => b !== AIR && BLOCK_OPAQUE[b] === 1;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const lush = gen.caveBiomeAt(wx, wz) === 1;
      const top = tops[lz * 16 + lx];
      for (let y = MIN_Y + 6; y < top - 12; y++) {
        const i = blockIndex(lx, y, lz);
        if (blocks[i] !== AIR) continue;
        const h = hash3(wx, y, wz, seed ^ 0x65ca);
        const r = (h & 0xffff) / 65536;
        const below = blocks[i - ROW], above = blocks[i + ROW];
        if (lush) {
          if (below === MOSS_BLOCK) {
            if (r < 0.025) {
              // Plantaforma grande de 1 a 3 bloques de alto.
              const n = 1 + ((h >>> 16) % 3);
              let k = 0;
              while (k < n && y + k < top - 12 && blocks[i + k * ROW] === AIR) k++;
              if (k === 0) continue;
              for (let j = 0; j < k - 1; j++) blocks[i + j * ROW] = BIG_DRIPLEAF_STEM;
              blocks[i + (k - 1) * ROW] = BIG_DRIPLEAF;
              continue;
            }
            if (r < 0.05 && above === AIR) {
              blocks[i] = SMALL_DRIPLEAF;
              blocks[i + ROW] = SMALL_DRIPLEAF + 1;
              continue;
            }
          }
          if (opaque(above)) {
            if (r > 0.992) {
              blocks[i] = SPORE_BLOSSOM;
              continue;
            }
            if (r > 0.93) {
              blocks[i] = HANGING_ROOTS;
              continue;
            }
          }
        }
        // Liquen luminoso en cualquier cueva: en una pared (dentro del chunk) o en el techo.
        if (((h >>> 16) & 0x3ff) < 5) {
          for (let d = 0; d < 4; d++) {
            const nx = lx + DIR_X[d], nzz = lz + DIR_Z[d];
            if (nx < 0 || nx > 15 || nzz < 0 || nzz > 15) continue;
            if (!opaque(blocks[blockIndex(nx, y, nzz)])) continue;
            blocks[i] = stateOf(GLOW_LICHEN, { face: d });
            break;
          }
          if (blocks[i] === AIR && opaque(above)) blocks[i] = stateOf(GLOW_LICHEN, { face: 4 });
        }
      }
    }
  }
}
