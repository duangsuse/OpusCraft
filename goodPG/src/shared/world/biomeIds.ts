// Identificadores y nombres de los biomas (compartidos por el generador de terreno y las estructuras).
// Los biomas no se guardan (salen del generador), pero los ids se usan en el código: sólo se añaden al final.

export const BIOME_OCEAN = 0;
export const BIOME_FROZEN_OCEAN = 1;
export const BIOME_BEACH = 2;
export const BIOME_PLAINS = 3;
export const BIOME_FOREST = 4;
export const BIOME_BIRCH_FOREST = 5;
export const BIOME_TAIGA = 6;
export const BIOME_SNOWY = 7;
export const BIOME_DESERT = 8;
export const BIOME_SAVANNA = 9;
/** Fase 7.6: las colinas ventosas de Minecraft (antes «montañas»). */
export const BIOME_MOUNTAINS = 10;
/** Fase 7.6: las laderas nevadas de Minecraft (antes «picos nevados»). */
export const BIOME_SNOWY_PEAKS = 11;
// Fase 5.
export const BIOME_SWAMP = 12;
export const BIOME_JUNGLE = 13;
export const BIOME_DARK_FOREST = 14;
export const BIOME_BADLANDS = 15;
export const BIOME_MUSHROOM_FIELDS = 16;
export const BIOME_CHERRY_GROVE = 17;
export const BIOME_MEADOW = 18;
export const BIOME_ICE_SPIKES = 19;
export const BIOME_WARM_OCEAN = 20;
export const BIOME_COLD_OCEAN = 21;
export const BIOME_DEEP_OCEAN = 22;
// Fase 7.6: los biomas del mundo normal que faltaban (salvo los de 2024–2026, fase 9).
export const BIOME_RIVER = 23;
export const BIOME_FROZEN_RIVER = 24;
export const BIOME_SNOWY_BEACH = 25;
export const BIOME_STONY_SHORE = 26;
export const BIOME_LUKEWARM_OCEAN = 27;
export const BIOME_DEEP_LUKEWARM_OCEAN = 28;
export const BIOME_DEEP_COLD_OCEAN = 29;
export const BIOME_DEEP_FROZEN_OCEAN = 30;
export const BIOME_SUNFLOWER_PLAINS = 31;
export const BIOME_FLOWER_FOREST = 32;
export const BIOME_OLD_GROWTH_BIRCH_FOREST = 33;
export const BIOME_WINDSWEPT_GRAVELLY_HILLS = 34;
export const BIOME_WINDSWEPT_FOREST = 35;
export const BIOME_GROVE = 36;
export const BIOME_FROZEN_PEAKS = 37;
export const BIOME_JAGGED_PEAKS = 38;
export const BIOME_STONY_PEAKS = 39;
export const BIOME_SNOWY_PLAINS = 40;
export const BIOME_OLD_GROWTH_PINE_TAIGA = 41;
export const BIOME_OLD_GROWTH_SPRUCE_TAIGA = 42;
export const BIOME_SPARSE_JUNGLE = 43;
export const BIOME_BAMBOO_JUNGLE = 44;
export const BIOME_ERODED_BADLANDS = 45;
export const BIOME_WOODED_BADLANDS = 46;
export const BIOME_SAVANNA_PLATEAU = 47;
export const BIOME_WINDSWEPT_SAVANNA = 48;
export const BIOME_MANGROVE_SWAMP = 49;
/** Biomas de cueva (sólo para verlos con F3: bajo tierra no cambian el bioma de la columna). */
export const BIOME_DRIPSTONE_CAVES = 50;
export const BIOME_LUSH_CAVES = 51;
// Fase 8: los biomas del Nether.
export const BIOME_NETHER_WASTES = 52;
// Fase 8.2 (biomas del Nether).
export const BIOME_SOUL_SAND_VALLEY = 53;
export const BIOME_CRIMSON_FOREST = 54;
export const BIOME_WARPED_FOREST = 55;
export const BIOME_BASALT_DELTAS = 56;
// Fase 8.6 (el End): la isla central, las tierras altas, las medias, las islas pequeñas y los páramos.
export const BIOME_THE_END = 57;
export const BIOME_END_HIGHLANDS = 58;
export const BIOME_END_MIDLANDS = 59;
export const BIOME_SMALL_END_ISLANDS = 60;
export const BIOME_END_BARRENS = 61;

/** ¿Es un bioma del End? */
export function isEndBiome(b: number): boolean {
  return b >= BIOME_THE_END && b <= BIOME_END_BARRENS;
}

export const BIOME_NAMES = [
  '海洋', '冰冻海洋', '沙滩', '平原', '森林', '桦木森林', '针叶林',
  '积雪针叶林', '沙漠', '热带草原', '风袭丘陵', '积雪山坡', '沼泽', '丛林', '黑森林',
  '恶地', '蘑菇岛', '樱花树林', '草甸', '冰刺之地', '暖水海洋',
  '冷水海洋', '深海',
  // Fase 7.6
  '河流', '冻河', '积雪沙滩', '石岸', '温水海洋', '温水深海',
  '冷水深海', '冰冻深海', '向日葵平原', '繁花森林',
  '原始桦木森林', '风袭沙砾丘陵', '风袭森林', '雪林', '冰封山峰',
  '尖峭山峰', '裸岩山峰', '雪原', '原始松木针叶林', '原始云杉针叶林',
  '稀疏丛林', '竹林', '风蚀恶地', '疏林恶地',
  '热带高原', '风袭热带草原', '红树林沼泽', '溶洞', '繁茂洞穴',
  // Fase 8
  '下界荒地',
  // Fase 8.2
  '灵魂沙峡谷', '绯红森林', '诡异森林', '玄武岩三角洲',
  // Fase 8.6
  '末地', '末地高地', '末地内陆', '末地小型岛屿', '末地荒地',
];

/**
 * Fase 7.6: bioma del que hereda lo general (criaturas, aldeas, estructuras, nieve…) cada bioma nuevo;
 * lo propio de cada uno (superficie, árboles, flores) lo mira el generador con su id.
 */
const PARENT: Record<number, number> = {
  [BIOME_RIVER]: BIOME_OCEAN, [BIOME_FROZEN_RIVER]: BIOME_OCEAN, [BIOME_SNOWY_BEACH]: BIOME_BEACH,
  [BIOME_STONY_SHORE]: BIOME_BEACH, [BIOME_LUKEWARM_OCEAN]: BIOME_OCEAN, [BIOME_DEEP_LUKEWARM_OCEAN]: BIOME_DEEP_OCEAN,
  [BIOME_DEEP_COLD_OCEAN]: BIOME_DEEP_OCEAN, [BIOME_DEEP_FROZEN_OCEAN]: BIOME_DEEP_OCEAN,
  [BIOME_SUNFLOWER_PLAINS]: BIOME_PLAINS, [BIOME_FLOWER_FOREST]: BIOME_FOREST,
  [BIOME_OLD_GROWTH_BIRCH_FOREST]: BIOME_BIRCH_FOREST, [BIOME_WINDSWEPT_GRAVELLY_HILLS]: BIOME_MOUNTAINS,
  [BIOME_WINDSWEPT_FOREST]: BIOME_MOUNTAINS, [BIOME_GROVE]: BIOME_SNOWY, [BIOME_FROZEN_PEAKS]: BIOME_SNOWY_PEAKS,
  [BIOME_JAGGED_PEAKS]: BIOME_SNOWY_PEAKS, [BIOME_STONY_PEAKS]: BIOME_MOUNTAINS, [BIOME_SNOWY_PLAINS]: BIOME_SNOWY,
  [BIOME_OLD_GROWTH_PINE_TAIGA]: BIOME_TAIGA, [BIOME_OLD_GROWTH_SPRUCE_TAIGA]: BIOME_TAIGA,
  [BIOME_SPARSE_JUNGLE]: BIOME_JUNGLE, [BIOME_BAMBOO_JUNGLE]: BIOME_JUNGLE, [BIOME_ERODED_BADLANDS]: BIOME_BADLANDS,
  [BIOME_WOODED_BADLANDS]: BIOME_BADLANDS, [BIOME_SAVANNA_PLATEAU]: BIOME_SAVANNA,
  [BIOME_WINDSWEPT_SAVANNA]: BIOME_SAVANNA, [BIOME_MANGROVE_SWAMP]: BIOME_SWAMP,
};

/** Bioma base (el mismo para los de antes de la fase 7.6). */
export function baseBiome(b: number): number {
  return PARENT[b] ?? b;
}

/** ¿Es un océano (de cualquier tipo)? Los ríos no lo son. */
export function isOceanBiome(b: number): boolean {
  if (b === BIOME_RIVER || b === BIOME_FROZEN_RIVER) return false;
  const p = baseBiome(b);
  return p === BIOME_OCEAN || p === BIOME_FROZEN_OCEAN || p === BIOME_WARM_OCEAN || p === BIOME_COLD_OCEAN || p === BIOME_DEEP_OCEAN;
}

/** ¿Es un río? */
export function isRiverBiome(b: number): boolean {
  return b === BIOME_RIVER || b === BIOME_FROZEN_RIVER;
}
