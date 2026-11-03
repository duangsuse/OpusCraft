// Fase 8.2 (biomas del Nether): los efectos de cada bioma del Nether (atributos de data/minecraft/worldgen/
// biome/*.json de la 26.3): color de la niebla, partícula del ambiente (con su probabilidad por bloque
// muestreado) y sonidos (bucle, «mood» y «additions»: los tres tienen su versión en cada bioma).
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from './biomeIds';

export type NetherParticle = 'crimson_spore' | 'warped_spore' | 'ash' | 'white_ash';

export interface NetherBiomeEffects {
  /** Color de la niebla (visual/fog_color), sRGB 0..255. */
  fog: readonly [number, number, number];
  /** Partícula del ambiente y probabilidad de salir en cada bloque muestreado (visual/ambient_particles). */
  particle: NetherParticle | null;
  particleChance: number;
}

const hex = (h: number): readonly [number, number, number] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

const EFFECTS: Readonly<Record<number, NetherBiomeEffects>> = {
  [BIOME_NETHER_WASTES]: { fog: hex(0x330808), particle: null, particleChance: 0 },
  [BIOME_SOUL_SAND_VALLEY]: { fog: hex(0x1b4745), particle: 'ash', particleChance: 0.00625 },
  [BIOME_CRIMSON_FOREST]: { fog: hex(0x330303), particle: 'crimson_spore', particleChance: 0.025 },
  [BIOME_WARPED_FOREST]: { fog: hex(0x1a051a), particle: 'warped_spore', particleChance: 0.01428 },
  [BIOME_BASALT_DELTAS]: { fog: hex(0x685f70), particle: 'white_ash', particleChance: 0.118093334 },
};

/** Efectos de un bioma del Nether (los de los desiertos si no es uno). */
export function netherBiomeEffects(biome: number): NetherBiomeEffects {
  return EFFECTS[biome] ?? EFFECTS[BIOME_NETHER_WASTES];
}

/** ¿Es un bioma del Nether? */
export function isNetherBiome(biome: number): boolean {
  return EFFECTS[biome] !== undefined;
}

/** Tick de «additions» (probabilidad por tick de un sonido suelto del bioma). */
export const NETHER_ADDITIONS_CHANCE = 0.0111;
/** «Mood»: ticks de oscuridad total para que suene, radio de la búsqueda y distancia extra del sonido. */
export const NETHER_MOOD_TICKS = 6000;
export const NETHER_MOOD_EXTENT = 8;
export const NETHER_MOOD_OFFSET = 2;
