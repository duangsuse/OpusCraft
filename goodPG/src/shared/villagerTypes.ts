// Tipos de aldeano (VillagerType de Java 26.3): cada aldeano es de un tipo según el bioma donde nace, que le cambia la
// ropa y algunas ofertas (las barcas del pescador, los estandartes y los mapas del cartógrafo). Los biomas que no están
// en la lista son de llanura. Se guardan por su índice (sólo se añade al final).
import {
  BIOME_BADLANDS, BIOME_DESERT, BIOME_ERODED_BADLANDS, BIOME_WOODED_BADLANDS, BIOME_BAMBOO_JUNGLE, BIOME_JUNGLE,
  BIOME_SPARSE_JUNGLE, BIOME_SAVANNA_PLATEAU, BIOME_SAVANNA, BIOME_WINDSWEPT_SAVANNA, BIOME_DEEP_FROZEN_OCEAN, BIOME_FROZEN_OCEAN,
  BIOME_FROZEN_RIVER, BIOME_ICE_SPIKES, BIOME_SNOWY_BEACH, BIOME_SNOWY, BIOME_SNOWY_PLAINS, BIOME_GROVE, BIOME_SNOWY_PEAKS,
  BIOME_FROZEN_PEAKS, BIOME_JAGGED_PEAKS, BIOME_SWAMP, BIOME_MANGROVE_SWAMP, BIOME_OLD_GROWTH_SPRUCE_TAIGA,
  BIOME_OLD_GROWTH_PINE_TAIGA, BIOME_WINDSWEPT_GRAVELLY_HILLS, BIOME_MOUNTAINS, BIOME_TAIGA, BIOME_WINDSWEPT_FOREST,
} from './world/biomeIds';

/** Tipos en el orden de Java (el índice es lo que se guarda). */
export const VILLAGER_TYPES = ['desert', 'jungle', 'plains', 'savanna', 'snow', 'swamp', 'taiga'] as const;
export type VillagerTypeKey = (typeof VILLAGER_TYPES)[number];
export const VT_DESERT = 0;
export const VT_JUNGLE = 1;
export const VT_PLAINS = 2;
export const VT_SAVANNA = 3;
export const VT_SNOW = 4;
export const VT_SWAMP = 5;
export const VT_TAIGA = 6;

/** VillagerType.BY_BIOME. */
const BY_BIOME = new Map<number, number>([
  [BIOME_BADLANDS, VT_DESERT], [BIOME_DESERT, VT_DESERT], [BIOME_ERODED_BADLANDS, VT_DESERT], [BIOME_WOODED_BADLANDS, VT_DESERT],
  [BIOME_BAMBOO_JUNGLE, VT_JUNGLE], [BIOME_JUNGLE, VT_JUNGLE], [BIOME_SPARSE_JUNGLE, VT_JUNGLE],
  [BIOME_SAVANNA_PLATEAU, VT_SAVANNA], [BIOME_SAVANNA, VT_SAVANNA], [BIOME_WINDSWEPT_SAVANNA, VT_SAVANNA],
  [BIOME_DEEP_FROZEN_OCEAN, VT_SNOW], [BIOME_FROZEN_OCEAN, VT_SNOW], [BIOME_FROZEN_RIVER, VT_SNOW], [BIOME_ICE_SPIKES, VT_SNOW],
  [BIOME_SNOWY_BEACH, VT_SNOW], [BIOME_SNOWY, VT_SNOW], [BIOME_SNOWY_PLAINS, VT_SNOW], [BIOME_GROVE, VT_SNOW],
  [BIOME_SNOWY_PEAKS, VT_SNOW], [BIOME_FROZEN_PEAKS, VT_SNOW], [BIOME_JAGGED_PEAKS, VT_SNOW],
  [BIOME_SWAMP, VT_SWAMP], [BIOME_MANGROVE_SWAMP, VT_SWAMP],
  [BIOME_OLD_GROWTH_SPRUCE_TAIGA, VT_TAIGA], [BIOME_OLD_GROWTH_PINE_TAIGA, VT_TAIGA], [BIOME_WINDSWEPT_GRAVELLY_HILLS, VT_TAIGA],
  [BIOME_MOUNTAINS, VT_TAIGA], [BIOME_TAIGA, VT_TAIGA], [BIOME_WINDSWEPT_FOREST, VT_TAIGA],
]);

/** Tipo de aldeano de un bioma (VillagerType.byBiome: llanura si no está en la lista). */
export function villagerTypeFor(biome: number): number {
  return BY_BIOME.get(biome) ?? VT_PLAINS;
}

/** Índice de un tipo por su clave (-1 si no existe). */
export function villagerTypeIndex(key: string): number {
  return (VILLAGER_TYPES as readonly string[]).indexOf(key);
}

/** Tipo válido que llega del guardado (llanura si no vale). */
export function sanitizeVillagerType(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < VILLAGER_TYPES.length ? n : VT_PLAINS;
}

/** Variante que viaja a los clientes: el oficio en los 4 bits de abajo y el tipo encima (su ropa). */
export function villagerVariant(prof: number, type: number): number {
  return (prof & 15) | (type << 4);
}
export const variantProf = (variant: number): number => variant & 15;
export const variantType = (variant: number): number => (variant >> 4) & 7;
