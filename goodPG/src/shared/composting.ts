// Compostador: probabilidad de que cada objeto suba un nivel (valores de Minecraft) y sus niveles.
import {
  COMPOSTER, familyBase, SHORT_GRASS, FERN, ALL_LEAVES, ALL_SAPLINGS, VINE, LILY_PAD, FLOWERS, PINK_PETALS,
  RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, CACTUS, SUGAR_CANE, PUMPKIN, MELON, CARVED_PUMPKIN, POPPY, DANDELION, CORNFLOWER, RED_MUSHROOM,
  BROWN_MUSHROOM, DEAD_BUSH, HAY_BALE, CAKE,
} from './blocks';
import {
  GLOW_BERRIES, WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, APPLE, BEETROOT, CARROT, POTATO, WHEAT,
  BAKED_POTATO, BREAD, PUMPKIN_PIE,
} from './items';

// Fase 6.5 (océano y plantas).
import {
  KELP, SEAGRASS, SEA_PICKLE, DRIED_KELP_BLOCK, HANGING_ROOTS, SMALL_DRIPLEAF, AZALEA_LEAVES, FLOWERING_AZALEA_LEAVES, TALL_GRASS,
  GLOW_LICHEN, LARGE_FERN, SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TORCHFLOWER, BIG_DRIPLEAF, SPORE_BLOSSOM, PITCHER_PLANT,
} from './blocks';
import { DRIED_KELP, SWEET_BERRIES } from './items';

/** Nivel con el compostador lleno (espera un segundo) y nivel listo para dar polvo de hueso. */
export const COMPOSTER_FULL = 7;
export const COMPOSTER_READY = 8;

const chances: Record<number, number> = {};
const set = (p: number, ids: number[]) => {
  for (const id of ids) chances[id] = p;
};
set(0.3, [WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS, SHORT_GRASS, ...ALL_LEAVES, ...ALL_SAPLINGS, PINK_PETALS]);
set(0.5, [CACTUS, SUGAR_CANE, MELON_SLICE, DEAD_BUSH, VINE, GLOW_BERRIES]);
set(0.65, [MOSS_BLOCK, AZALEA]);
set(0.3, [MOSS_CARPET]);
set(0.85, [FLOWERING_AZALEA]);
set(0.65, [APPLE, BEETROOT, CARROT, POTATO, WHEAT, MELON, PUMPKIN, CARVED_PUMPKIN, POPPY, DANDELION, CORNFLOWER,
  RED_MUSHROOM, BROWN_MUSHROOM, FERN, LILY_PAD, ...Object.values(FLOWERS)]);
set(0.85, [BAKED_POTATO, BREAD, HAY_BALE, RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM]);
set(1, [CAKE, PUMPKIN_PIE]);
/** Probabilidad de que un objeto suba el nivel del compostador (0 = no se composta). */
export const COMPOST_CHANCE: Readonly<Record<number, number>> = chances;

/** Nivel de un compostador (0..8) o -1 si no lo es. */
export function composterLevel(id: number): number {
  return familyBase(id) === COMPOSTER ? id - COMPOSTER : -1;
}

/** ¿Acepta el compostador este objeto? (no si está lleno o esperando). */
export function canCompost(level: number, item: number): boolean {
  return level >= 0 && level < COMPOSTER_FULL && (COMPOST_CHANCE[item] ?? 0) > 0;
}

/** ¿Sube de nivel? Vacío siempre sube; si no, según la probabilidad del objeto. */
export function compostRises(level: number, item: number, r: number): boolean {
  return level === 0 || r < (COMPOST_CHANCE[item] ?? 0);
}

// Fase 6.5 (océano y plantas): plantas marinas y plantas nuevas.
set(0.3, [KELP, SEAGRASS, DRIED_KELP, SWEET_BERRIES, HANGING_ROOTS, SMALL_DRIPLEAF, AZALEA_LEAVES, FLOWERING_AZALEA_LEAVES]);
set(0.5, [TALL_GRASS, GLOW_LICHEN, DRIED_KELP_BLOCK]);
set(0.65, [SEA_PICKLE, LARGE_FERN, SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TORCHFLOWER, BIG_DRIPLEAF, SPORE_BLOSSOM]);
set(0.85, [PITCHER_PLANT]);
