// Fase 7.5 (océano): las estructuras del mar en la rejilla de structures.ts, con el reparto de Minecraft
// Java (espaciado y separación en chunks): monumentos oceánicos (32/5) en los océanos profundos, ruinas
// oceánicas (20/8) en cualquier océano y tesoros enterrados en las playas (1 % de los chunks).
import { SEA_LEVEL, hash2 } from '../constants';
import {
  BIOME_DEEP_OCEAN, BIOME_BEACH, BIOME_WARM_OCEAN, isOceanBiome, baseBiome, BIOME_LUKEWARM_OCEAN, BIOME_DEEP_LUKEWARM_OCEAN,
  BIOME_SNOWY_BEACH,
} from './biomeIds';
import { buildMonument, MONUMENT_RADIUS, MONUMENT_Y } from './monument';
import { buildOceanRuins, buildBuriedTreasure, RUINS_RADIUS } from './oceanRuins';
import type { GridType } from './structures';
import type { ColumnInfo } from './terrain';

const tmp: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

/** Chunks de cada región del tesoro enterrado y probabilidad de que su candidata lo tenga (1 % por chunk). */
const TREASURE_SPACING = 4;
const TREASURE_CHANCE = TREASURE_SPACING * TREASURE_SPACING * 0.01;

export const OCEAN_STRUCTURES: GridType[] = [
  {
    key: 'monument', spacing: 32, separation: 5, salt: 10387313, radius: MONUMENT_RADIUS,
    site: (gen, x, z, inf) => {
      // Océano profundo en el centro y alrededor; océano (de cualquier tipo) en todas las esquinas.
      if (baseBiome(inf.biome) !== BIOME_DEEP_OCEAN) return null;
      for (const [dx, dz] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) {
        if (baseBiome(gen.columnInfo(x + dx, z + dz, tmp).biome) !== BIOME_DEEP_OCEAN) return null;
      }
      for (const [dx, dz] of [[29, 29], [-29, 29], [29, -29], [-29, -29]]) {
        if (!isOceanBiome(gen.columnInfo(x + dx, z + dz, tmp).biome)) return null;
      }
      return MONUMENT_Y;
    },
    build: (c, s) => buildMonument(c, s),
  },
  {
    key: 'ocean_ruins', spacing: 20, separation: 8, salt: 14357621, radius: RUINS_RADIUS,
    site: (gen, x, z, inf) => {
      if (!isOceanBiome(inf.biome)) return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
      return h <= SEA_LEVEL - 5 ? h : null;
    },
    build: (c, s, gen) => buildOceanRuins(c, s, gen, [BIOME_WARM_OCEAN, BIOME_LUKEWARM_OCEAN, BIOME_DEEP_LUKEWARM_OCEAN].includes(gen.columnInfo(s.x, s.z, tmp).biome)),
  },
  {
    key: 'buried_treasure', spacing: TREASURE_SPACING, separation: 1, salt: 10387320, radius: 1,
    site: (gen, x, z, inf) => {
      if ((inf.biome !== BIOME_BEACH && inf.biome !== BIOME_SNOWY_BEACH) || (hash2(x, z, gen.seed ^ 0x7e5a) % 1000) / 1000 >= TREASURE_CHANCE) return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
      return h >= SEA_LEVEL - 3 ? h : null;
    },
    build: (c, s) => buildBuriedTreasure(c, s),
  },
];

/** Nombres (y claves de /localizar). */
export const OCEAN_STRUCTURE_NAMES: Readonly<Record<string, string>> = {
  monument: 'Monumento oceánico', ocean_ruins: 'Ruinas oceánicas', buried_treasure: 'Tesoro enterrado',
};
