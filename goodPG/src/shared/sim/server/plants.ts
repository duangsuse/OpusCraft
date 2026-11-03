// Grupos de bloques de vegetación que usan varios sistemas del servidor.
import { GRASS, DIRT, SNOWY_GRASS, WOOD_TYPES, ALL_LEAVES, isLog } from '../../blocks';
import { PODZOL, COARSE_DIRT, ROOTED_DIRT } from '../../blocks'; // Fase 6.5 (materiales)

/** Todo lo que es tronco, también los tumbados (que no están en ALL_LOGS): sostienen las hojas y, al quitarlos, las pudren. */
export const LOGS: Pick<ReadonlySet<number>, 'has'> = { has: isLog };
export const LEAVES: ReadonlySet<number> = new Set(ALL_LEAVES);
/**
 * Brote → tipo de árbol: su posición en WOOD_TYPES (0 roble, 1 abedul, 2 abeto, 3 jungla, 4 acacia,
 * 5 roble oscuro, 6 cerezo; fase 6.5: 7 mangle, 8 roble pálido).
 */
export const SAPLINGS: ReadonlyMap<number, number> = new Map(WOOD_TYPES.map((w, i) => [w.sapling, i]));
/** Suelo donde crecen brotes y caña. */
export const SOIL: ReadonlySet<number> = new Set([GRASS, DIRT, SNOWY_GRASS, PODZOL, COARSE_DIRT, ROOTED_DIRT]); // Fase 6.5: suelos nuevos
