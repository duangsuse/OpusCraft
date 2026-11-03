// Fase 6.5 (océano y plantas): qué sueltan los bloques del mar y las plantas nuevas (valores de
// Minecraft sin toque de seda): los corales y gorgonias nada, los bloques de coral su versión muerta,
// las plantas marinas, el liquen, las raíces y la plantaforma pequeña sólo con tijeras, los pepinos
// uno por pepino, las plantas de dos bloques una vez (por la mitad de abajo) y las bayas dulces según
// lo crecido que esté el arbusto.
import {
  SEAGRASS, SEAGRASS_SHORT, TALL_SEAGRASS_LOWER, SEA_PICKLE, SMALL_DRIPLEAF, TALL_GRASS, LARGE_FERN, SHORT_GRASS, FERN,
  AZALEA, FLOWERING_AZALEA, AZALEA_LEAVES, FLOWERING_AZALEA_LEAVES, HANGING_ROOTS, isSeagrass, isSeaPickle, pickleCount,
  isCoralBlock, isCoralPlant, isLiveCoral, deadCoralOf, tallPlantBase, isSweetBerryBush, berryAge, isGlowLichen, GLOW_LICHEN,
} from '../blocks';
import { ITEMS, SWEET_BERRIES, WHEAT_SEEDS, STICK, type ItemStack } from '../items';

/** Botín de un bloque de la fase 6.5, o null si el bloque no es de éstos. */
export function plantDrops65(block: number, toolId: number, rand: () => number): ItemStack[] | null {
  const shears = toolId > 0 && ITEMS[toolId]?.tool?.kind === 'shears';
  const one = (id: number, n = 1): ItemStack[] => (n > 0 ? [{ id, count: n }] : []);
  if (isCoralBlock(block)) return one(isLiveCoral(block) ? deadCoralOf(block) : block);
  if (isCoralPlant(block)) return [];
  if (isSeagrass(block)) {
    if (!shears) return [];
    return block === SEAGRASS_SHORT ? one(SEAGRASS) : block === TALL_SEAGRASS_LOWER ? one(SEAGRASS, 2) : [];
  }
  if (isSeaPickle(block)) return one(SEA_PICKLE, pickleCount(block));
  if (isSweetBerryBush(block)) {
    const age = berryAge(block);
    return one(SWEET_BERRIES, age === 3 ? 2 + Math.floor(rand() * 2) : age === 2 ? 1 + Math.floor(rand() * 2) : 1);
  }
  if (isGlowLichen(block)) return shears ? one(GLOW_LICHEN) : [];
  if (block === HANGING_ROOTS) return shears ? one(HANGING_ROOTS) : [];
  if (block === AZALEA_LEAVES || block === FLOWERING_AZALEA_LEAVES) {
    if (shears) return one(block);
    const out: ItemStack[] = [];
    if (rand() < 0.05) out.push({ id: block === AZALEA_LEAVES ? AZALEA : FLOWERING_AZALEA, count: 1 });
    if (rand() < 0.02) out.push({ id: STICK, count: 1 + Math.floor(rand() * 2) });
    return out;
  }
  const tall = tallPlantBase(block);
  if (tall >= 0) {
    // La mitad de arriba no suelta nada: lo suelta la de abajo al quedarse sin ella (o al romperla).
    if (block !== tall) return [];
    if (tall === TALL_GRASS || tall === LARGE_FERN) {
      if (shears) return one(tall === TALL_GRASS ? SHORT_GRASS : FERN, 2);
      return rand() < 0.125 ? one(WHEAT_SEEDS) : [];
    }
    if (tall === SMALL_DRIPLEAF) return shears ? one(SMALL_DRIPLEAF) : [];
    return one(tall);
  }
  return null;
}
