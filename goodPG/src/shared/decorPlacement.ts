// Fase 6.5 (decoración): cómo se colocan los bloques de decoración con estados (lo usan placement.ts en
// el cliente, que lo predice, y el servidor, que lo aplica). Faroles de pie o colgando, campanas en el
// suelo o en el techo, cadenas en el eje de la cara y andamios en voladizo (o arriba de la torre).
import { MAX_Y } from './constants';
import {
  LANTERN, BELL, BELL_CEILING, BELL_FLOOR, IRON_CHAIN, SCAFFOLDING, BLOCK_REPLACEABLE, BLOCK_FLUID, stateOf, familyBase,
  blockSupported, chainForNormal, isScaffolding, scaffoldSupported, type NeighborGet,
} from './blocks';
import type { Edit, GetBlock, PlaceHit } from './placement';

/** Torre de andamios más alta que se sube de un clic desde abajo. */
const SCAFFOLD_TOWER = 64;

/**
 * Bloques que coloca un objeto de decoración en (x, y, z) (la celda ya comprobada como reemplazable);
 * null si no se puede y undefined si no es de decoración.
 */
export function planDecor(
  get: GetBlock, hit: PlaceHit, base: number, x: number, y: number, z: number, face: 'up' | 'down' | 'side', facing: number,
): Edit[] | null | undefined {
  const rel: NeighborGet = (dx, dy, dz) => get(x + dx, y + dy, z + dz);
  const first = (ids: number[]): Edit[] | null => {
    for (const id of ids) if (blockSupported(id, rel)) return [[x, y, z, id]];
    return null;
  };
  switch (familyBase(base)) {
    case LANTERN: {
      // Clic en el techo: colgando; si no, de pie (y si no hay suelo, colgando si hay techo).
      const hanging = stateOf(LANTERN, { hanging: 1 });
      return first(face === 'down' ? [hanging, LANTERN] : [LANTERN, hanging]);
    }
    case BELL: {
      const floor = stateOf(BELL, { facing, attach: BELL_FLOOR }), ceiling = stateOf(BELL, { facing, attach: BELL_CEILING });
      return first(face === 'down' ? [ceiling, floor] : [floor, ceiling]);
    }
    case IRON_CHAIN:
      return [[x, y, z, chainForNormal(hit.nx, hit.ny)]];
    case SCAFFOLDING:
      return scaffoldSupported(rel) ? [[x, y, z, SCAFFOLDING]] : null;
  }
  return undefined;
}

/**
 * Andamio sobre la cara de abajo de otro andamio (mirando hacia arriba desde dentro de la torre): uno
 * más en lo alto de su columna. Se mira antes que nada porque la celda de delante suele ser andamio.
 */
export function planScaffoldTower(get: GetBlock, hit: PlaceHit, base: number): Edit[] | null | undefined {
  if (familyBase(base) !== SCAFFOLDING || hit.ny !== -1 || !isScaffolding(hit.id)) return undefined;
  let ty = hit.y;
  while (ty < MAX_Y - 1 && ty - hit.y < SCAFFOLD_TOWER && isScaffolding(get(hit.x, ty, hit.z))) ty++;
  const top = get(hit.x, ty, hit.z);
  if (ty >= MAX_Y || top < 0 || !BLOCK_REPLACEABLE[top] || BLOCK_FLUID[top] || !isScaffolding(get(hit.x, ty - 1, hit.z))) return null;
  return [[hit.x, ty, hit.z, SCAFFOLDING]];
}
