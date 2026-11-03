// Fase 7 (redstone): cómo se colocan los componentes (lo usan placement.ts en el cliente, que lo predice,
// y el servidor, que lo aplica). Polvo y placas sobre una cara firme; antorchas de pie o en la pared;
// palancas y botones en el suelo, la pared o el techo; repetidores y comparadores con la salida hacia
// donde mira el jugador; ganchos en la pared; la cuerda tendida donde sea; cofres trampa que se unen en
// dobles; y pararrayos apuntando hacia fuera de la cara tocada.
import {
  REDSTONE_WIRE, wireState, REDSTONE_TORCH, REDSTONE_WALL_TORCH, LEVER, isButton, MOUNT_FLOOR, MOUNT_WALL, MOUNT_CEILING,
  isPressurePlate, isWeightedPlate, REPEATER, COMPARATOR, TRIPWIRE_HOOK, TRIPWIRE, TRAPPED_CHEST, TRAPPED_CHEST_DOUBLE,
  isLightningRod, stateOf, familyBase, blockSupported, chestPartnerDir, type NeighborGet,
} from './blocks';
import { DIR_X, DIR_Z } from './blockModels';
import type { Edit, GetBlock, PlaceHit } from './placement';

/** Dirección (0 N, 1 E, 2 S, 3 O) de una normal horizontal. */
function dirOfNormal(nx: number, nz: number): number {
  return nz < 0 ? 0 : nx > 0 ? 1 : nz > 0 ? 2 : 3;
}

/** Cara (0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z) de una normal. */
function faceOfNormal(nx: number, ny: number, nz: number): number {
  return ny > 0 ? 2 : ny < 0 ? 3 : nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 4 : 5;
}

/**
 * Bloques que coloca un componente de redstone en (x, y, z) (la celda ya comprobada como reemplazable);
 * null si no se puede y undefined si no es un componente de redstone. `facing`: hacia donde mira el jugador.
 */
export function planRedstone(
  get: GetBlock, hit: PlaceHit, base: number, x: number, y: number, z: number, face: 'up' | 'down' | 'side', facing: number,
): Edit[] | null | undefined {
  const rel: NeighborGet = (dx, dy, dz) => get(x + dx, y + dy, z + dz);
  const one = (id: number): Edit[] => [[x, y, z, id]];
  const ok = (id: number): Edit[] | null => (blockSupported(id, rel) ? one(id) : null);
  const b = familyBase(base);
  if (b === REDSTONE_WIRE) return ok(wireState(0, false));
  if (b === REDSTONE_TORCH) {
    if (face === 'down') return null;
    if (face === 'side') {
      const wall = stateOf(REDSTONE_WALL_TORCH, { facing: dirOfNormal(hit.nx, hit.nz), off: 0 });
      if (blockSupported(wall, rel)) return one(wall);
    }
    return one(REDSTONE_TORCH); // de pie: el apoyo de abajo lo comprueba quien llama (como las antorchas)
  }
  if (b === LEVER || isButton(b)) {
    const mount = face === 'up' ? MOUNT_FLOOR : face === 'down' ? MOUNT_CEILING : MOUNT_WALL;
    const f = mount === MOUNT_WALL ? dirOfNormal(hit.nx, hit.nz) : facing;
    return ok(stateOf(b, { mount, facing: f, powered: 0 }));
  }
  if (isPressurePlate(b) || isWeightedPlate(b)) return ok(b);
  // La señal sale hacia donde mira el jugador (entra por el lado que tiene delante).
  if (b === REPEATER || b === COMPARATOR) return ok(stateOf(b, { facing }));
  if (b === TRIPWIRE_HOOK) return face === 'side' ? ok(stateOf(TRIPWIRE_HOOK, { facing: dirOfNormal(hit.nx, hit.nz) })) : null;
  if (b === TRIPWIRE) return one(TRIPWIRE);
  if (b === TRAPPED_CHEST) {
    // Con el frente hacia el jugador; junto a otro cofre trampa igual forma uno doble.
    const f = (facing + 2) & 3;
    for (const side of [0, 1]) {
      const d = chestPartnerDir(f, side);
      const nx = x + DIR_X[d], nz = z + DIR_Z[d];
      if (get(nx, y, nz) !== TRAPPED_CHEST + f) continue;
      return [
        [x, y, z, stateOf(TRAPPED_CHEST_DOUBLE, { facing: f, side })],
        [nx, y, nz, stateOf(TRAPPED_CHEST_DOUBLE, { facing: f, side: 1 - side })],
      ];
    }
    return one(TRAPPED_CHEST + f);
  }
  if (isLightningRod(b)) return one(b + faceOfNormal(hit.nx, hit.ny, hit.nz));
  return undefined;
}
