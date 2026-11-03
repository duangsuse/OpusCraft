// Fase 6.5 (océano y plantas): cómo se colocan las plantas marinas y las plantas nuevas (lo usan el
// cliente, que lo predice, y el servidor, que lo aplica, desde planPlacement). Las algas y las plantas
// marinas sólo van en agua; los corales y los pepinos, anegados si la celda tiene agua; las gorgonias
// contra una pared quedan de pared; los pepinos se apilan hasta 4; las plantas de dos bloques ocupan
// también la celda de encima; el liquen se agarra al bloque golpeado y las raíces y la flor de esporas
// cuelgan del techo.
import { MAX_Y } from './constants';
import {
  BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_REPLACEABLE, BLOCK_OPAQUE, AIR, WATER, KELP_TOP, SEAGRASS, SEAGRASS_SHORT, SEA_PICKLE,
  CORALS, DEAD_CORALS, CORAL_TYPES, BIG_DRIPLEAF, BIG_DRIPLEAF_STEM, GLOW_LICHEN, LICHEN_DIRS, HANGING_ROOTS, SPORE_BLOSSOM,
  SWEET_BERRY_BUSH, KELP, isSeaPickle, isBigDripleaf, isTallPlant, tallPlantBase, isSweetBerryBush, berryAge, isSeagrass,
  isWaterlogged, isCoralBlock, isKelp, TALL_FLOWERS, GROWS_TALL, AZALEA, FLOWERING_AZALEA, stateOf, stateProps,
  blockSupported, type NeighborGet,
} from './blocks';
import type { Edit, GetBlock, PlaceHit } from './placement';

/** Gorgonia (objeto) → su versión de pared. */
const WALL_FAN_OF = new Map<number, number>();
/** Corales y gorgonias de suelo (vivos y muertos). */
const FLOOR_CORALS = new Set<number>();
for (const t of CORAL_TYPES) {
  for (const set of [CORALS[t], DEAD_CORALS[t]]) {
    WALL_FAN_OF.set(set.fan, set.wallFan);
    FLOOR_CORALS.add(set.coral).add(set.fan);
  }
}

/** ¿Agua fuente (o una planta anegada que se puede sustituir) en la celda? */
export function isWaterCell(id: number): boolean {
  return id > 0 && BLOCK_FLUID[id] === 1 && BLOCK_FLUID_LEVEL[id] === 0 && (!isWaterlogged(id) || BLOCK_REPLACEABLE[id] === 1);
}

function rel(get: GetBlock, x: number, y: number, z: number): NeighborGet {
  return (dx, dy, dz) => get(x + dx, y + dy, z + dz);
}

function dirOfNormal(nx: number, nz: number): number {
  if (nz < 0) return 0;
  if (nx > 0) return 1;
  if (nz > 0) return 2;
  return 3;
}

/**
 * Colocación de las plantas de la fase 6.5 en la celda (x, y, z) (la que queda junto a la cara
 * golpeada). Devuelve las ediciones, null si no se puede o undefined si el objeto no es de estos.
 */
export function planPlant65(get: GetBlock, hit: PlaceHit, x: number, y: number, z: number, base: number): Edit[] | null | undefined {
  const cur = get(x, y, z);
  const wet = isWaterCell(cur);
  const free = cur >= 0 && BLOCK_REPLACEABLE[cur] === 1;
  const face = hit.ny > 0 ? 'up' : hit.ny < 0 ? 'down' : 'side';
  const at = (id: number): Edit[] | null => (blockSupported(id, rel(get, x, y, z)) ? [[x, y, z, id]] : null);

  // Pepinos de mar: sobre otro grupo, uno más (hasta 4).
  if (base === SEA_PICKLE) {
    if (isSeaPickle(hit.id)) {
      const st = stateProps(hit.id)!;
      return st.count < 3 ? [[hit.x, hit.y, hit.z, stateOf(SEA_PICKLE, { count: st.count + 1, water: st.water })]] : null;
    }
    if (!free || face === 'down') return null;
    return at(stateOf(SEA_PICKLE, { count: 0, water: wet ? 1 : 0 }));
  }
  // Algas y plantas marinas: sólo en agua.
  if (base === KELP || base === SEAGRASS) {
    if (!wet || face === 'down') return null;
    return at(base === KELP ? KELP_TOP : SEAGRASS_SHORT);
  }
  // Corales y gorgonias: en el suelo, o gorgonia de pared contra un lateral.
  if (FLOOR_CORALS.has(base)) {
    if (!free || face === 'down') return null;
    const water = wet ? 1 : 0;
    const wall = WALL_FAN_OF.get(base);
    if (face === 'side' && wall !== undefined) {
      const id = stateOf(wall, { water, facing: dirOfNormal(hit.nx, hit.nz) });
      if (blockSupported(id, rel(get, x, y, z))) return [[x, y, z, id]];
    }
    return at(stateOf(base, { water }));
  }
  // Plantaforma grande sobre otra: la de abajo pasa a tallo y la hoja sube.
  if (base === BIG_DRIPLEAF) {
    if (isBigDripleaf(hit.id) && face === 'up') {
      if (hit.y + 1 >= MAX_Y || get(hit.x, hit.y + 1, hit.z) !== AIR) return null;
      return [[hit.x, hit.y, hit.z, BIG_DRIPLEAF_STEM], [hit.x, hit.y + 1, hit.z, BIG_DRIPLEAF]];
    }
    if (!free || BLOCK_FLUID[cur]) return null;
    return at(BIG_DRIPLEAF);
  }
  // Plantas de dos bloques: también la celda de encima.
  if (isTallPlant(base) && tallPlantBase(base) === base) {
    if (!free || BLOCK_FLUID[cur] || y + 1 >= MAX_Y) return null;
    const above = get(x, y + 1, z);
    if (above < 0 || BLOCK_REPLACEABLE[above] !== 1 || BLOCK_FLUID[above]) return null;
    const g: NeighborGet = (dx, dy, dz) => (dx === 0 && dz === 0 && dy === 1 ? base + 1 : get(x + dx, y + dy, z + dz));
    return blockSupported(base, g) ? [[x, y, z, base], [x, y + 1, z, base + 1]] : null;
  }
  // Liquen: pegado al bloque golpeado.
  if (base === GLOW_LICHEN) {
    if (!free || BLOCK_FLUID[cur]) return null;
    const f = LICHEN_DIRS.findIndex(([dx, dy, dz]) => dx === -hit.nx && dy === -hit.ny && dz === -hit.nz);
    return f < 0 ? null : at(stateOf(GLOW_LICHEN, { face: f }));
  }
  // Raíces colgantes y flor de esporas: bajo un techo.
  if (base === HANGING_ROOTS || base === SPORE_BLOSSOM) {
    if (!free || BLOCK_FLUID[cur] || face !== 'down') return null;
    return at(base);
  }
  if (base === SWEET_BERRY_BUSH) {
    if (!free || BLOCK_FLUID[cur]) return null;
    return at(SWEET_BERRY_BUSH);
  }
  return undefined;
}

/** ¿Tendría efecto el polvo de hueso sobre una planta de la fase 6.5? (el cliente lo usa para gastarlo). */
export function canFertilize65(get: GetBlock, x: number, y: number, z: number): boolean {
  const id = get(x, y, z);
  if (id <= 0) return false;
  if (isSweetBerryBush(id)) return berryAge(id) < 3;
  if (id === SEAGRASS_SHORT) return get(x, y + 1, z) === WATER;
  if (isSeagrass(id) || isKelp(id)) return false;
  if (isSeaPickle(id)) return isWaterlogged(id) && isCoralBlock(get(x, y - 1, z));
  if (isBigDripleaf(id)) return get(x, y + 1, z) === AIR;
  const tall = tallPlantBase(id);
  if (tall >= 0) return TALL_FLOWERS.includes(tall);
  if (GROWS_TALL.has(id)) return get(x, y + 1, z) === AIR;
  if (id === AZALEA || id === FLOWERING_AZALEA) return true;
  // Suelo bajo el agua: echa plantas marinas alrededor.
  return BLOCK_OPAQUE[id] === 1 && get(x, y + 1, z) === WATER;
}
