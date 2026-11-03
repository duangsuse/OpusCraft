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
  'Océano', 'Océano helado', 'Playa', 'Llanura', 'Bosque', 'Bosque de abedules', 'Taiga',
  'Taiga nevada', 'Desierto', 'Sabana', 'Colinas ventosas', 'Laderas nevadas', 'Pantano', 'Jungla', 'Bosque oscuro',
  'Tierras baldías', 'Campos de champiñones', 'Arboleda de cerezos', 'Pradera', 'Picos de hielo', 'Océano cálido',
  'Océano frío', 'Océano profundo',
  // Fase 7.6
  'Río', 'Río helado', 'Playa nevada', 'Costa pedregosa', 'Océano templado', 'Océano templado profundo',
  'Océano frío profundo', 'Océano helado profundo', 'Llanura de girasoles', 'Bosque de flores',
  'Bosque de abedules viejos', 'Colinas ventosas de grava', 'Bosque ventoso', 'Arboleda nevada', 'Picos helados',
  'Picos escarpados', 'Picos pedregosos', 'Llanura nevada', 'Taiga de pinos viejos', 'Taiga de abetos viejos',
  'Jungla dispersa', 'Jungla de bambú', 'Tierras baldías erosionadas', 'Tierras baldías boscosas',
  'Meseta de sabana', 'Sabana ventosa', 'Pantano de manglares', 'Cuevas de goteo', 'Cuevas frondosas',
  // Fase 8
  'Desiertos del Nether',
  // Fase 8.2
  'Valle de almas', 'Bosque carmesí', 'Bosque distorsionado', 'Deltas de basalto',
  // Fase 8.6
  'El End', 'Tierras altas del End', 'Tierras medias del End', 'Islas pequeñas del End', 'Páramos del End',
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
