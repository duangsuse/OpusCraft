// Polvo de redstone, como en Minecraft Java (RedStoneWireBlock con el evaluador de siempre, el
// «DefaultRedstoneWireEvaluator»). Auditoría de la redstone: antes se resolvía la red entera de una vez; el
// resultado final era el mismo, pero no el orden de las actualizaciones, y de ese orden dependen los
// circuitos técnicos. Ahora va cable a cable, igual que en Java:
// - Cada cable recalcula su potencia (calculateTargetStrength: la de fuera, sin contar otros cables, o la de
//   sus cables vecinos menos 1) y, si cambia, la cambia sin avisar (opción 2) y avisa a los vecinos de él y de
//   sus seis vecinos en el orden en que Java recorre un HashSet<BlockPos> (el que da el comportamiento según
//   el sitio y la dirección).
// - Al ponerse y al quitarse avisa además a los de arriba y abajo y a los cables de las esquinas.
// Quién da potencia a quién: un cable recibe de los cables de su nivel, del que tiene encima en diagonal si el
// bloque de al lado conduce y el de encima de él no, y del que tiene debajo en diagonal si el de al lado no
// conduce. Por eso sube por escalones de piedra, pero por la piedra luminosa (que no conduce) sólo sube.
import { isWire, wirePower, wireDot, wireState, REDSTONE_WIRE } from '../blocks/redstoneBlocks';
import { familyBase } from '../blocks/registry';
import {
  isConductor, registerRedstone, FACE_X, FACE_Y, FACE_Z, JAVA_DIRECTIONS, HORIZONTAL, UP, DOWN, UPDATE_CLIENTS,
  type RedstoneApi, type RedstoneView,
} from './api';
import { bestNeighborSignal } from './signals';

/** Potencia de un bloque si es polvo (getWireSignal de Java). */
const wireSignal = (id: number) => (isWire(id) ? wirePower(id) : 0);

/** calculateTargetStrength de Java: la potencia que le toca al cable de (x, y, z). */
export function wireTarget(v: RedstoneView, x: number, y: number, z: number): number {
  // shouldSignal = false: ningún polvo cuenta como fuente (lo hace el parámetro noWire).
  const i = bestNeighborSignal(v, x, y, z, true);
  let j = 0;
  if (i < 15) {
    const aboveConducts = isConductor(v.getBlock(x, y + 1, z));
    for (const f of HORIZONTAL) {
      const sx = x + FACE_X[f], sz = z + FACE_Z[f];
      const side = v.getBlock(sx, y, sz);
      j = Math.max(j, wireSignal(side));
      if (isConductor(side) && !aboveConducts) j = Math.max(j, wireSignal(v.getBlock(sx, y + 1, sz)));
      else if (!isConductor(side)) j = Math.max(j, wireSignal(v.getBlock(sx, y - 1, sz)));
    }
  }
  return Math.max(i, j - 1);
}

/** hashCode de BlockPos (Vec3i) en Java: (y + z·31)·31 + x, en enteros de 32 bits. */
export function javaPosHash(x: number, y: number, z: number): number {
  return (Math.imul((y + Math.imul(z, 31)) | 0, 31) + x) | 0;
}

/** Cubo de un HashMap de 16 cubos para ese hash (HashMap.hash de Java: h ^ (h >>> 16)). */
const bucketOf = (h: number) => (h ^ (h >>> 16)) & 15;

const orderTmp: number[] = [];
/**
 * El propio cable y sus seis vecinos en el orden en que Java recorre `Sets.newHashSet()` tras añadirlos
 * (primero él y luego en el orden de Direction.values()): por cubos del 0 al 15 y, dentro de cada cubo, por
 * orden de inserción. Devuelve las posiciones seguidas (x, y, z) en `out`.
 */
export function hashSetOrder(x: number, y: number, z: number, out: number[] = orderTmp): number[] {
  const px = [x], py = [y], pz = [z];
  for (const f of JAVA_DIRECTIONS) {
    px.push(x + FACE_X[f]);
    py.push(y + FACE_Y[f]);
    pz.push(z + FACE_Z[f]);
  }
  out.length = 0;
  const buckets = px.map((_, i) => bucketOf(javaPosHash(px[i], py[i], pz[i])));
  for (let b = 0; b < 16; b++) {
    for (let i = 0; i < 7; i++) if (buckets[i] === b) out.push(px[i], py[i], pz[i]);
  }
  return out;
}

/**
 * Orden en que Java recorre las claves de un HashMap<BlockPos> que nunca pasó de 12 (16 cubos): por cubo y,
 * dentro de cada cubo, por orden de inserción (quitar claves no cambia el orden de las que quedan). `cells`,
 * las que quedan, en el orden en que se metieron. Lo usa el pistón para las celdas que vacía.
 */
export function javaHashMapOrder<T extends { x: number; y: number; z: number }>(cells: readonly T[]): T[] {
  return cells.map((c, i) => ({ c, b: bucketOf(javaPosHash(c.x, c.y, c.z)), i })).sort((a, b) => a.b - b.b || a.i - b.i).map((e) => e.c);
}

/** updatePowerStrength de Java: recalcula el cable y, si cambia, avisa en el orden del HashSet. */
export function updateWirePower(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const target = wireTarget(api, x, y, z);
  if (wirePower(id) === target) return;
  if (api.getBlock(x, y, z) === id) api.setBlock(x, y, z, wireState(target, wireDot(id)), UPDATE_CLIENTS);
  const order = hashSetOrder(x, y, z, []);
  for (let i = 0; i < order.length; i += 3) api.updateNeighbors(order[i], order[i + 1], order[i + 2], -1, REDSTONE_WIRE);
}

/** checkCornerChangeAt de Java: si hay polvo en (x, y, z), avisa a sus vecinos y a los de sus seis vecinos. */
function checkCorner(api: RedstoneApi, x: number, y: number, z: number): void {
  if (!isWire(api.getBlock(x, y, z))) return;
  api.updateNeighbors(x, y, z, -1, REDSTONE_WIRE);
  for (const f of JAVA_DIRECTIONS) api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, REDSTONE_WIRE);
}

/** updateNeighborsOfNeighboringWires de Java: los cables de al lado y de las esquinas de arriba y abajo. */
function updateNeighboringWires(api: RedstoneApi, x: number, y: number, z: number): void {
  for (const f of HORIZONTAL) checkCorner(api, x + FACE_X[f], y, z + FACE_Z[f]);
  for (const f of HORIZONTAL) {
    const sx = x + FACE_X[f], sz = z + FACE_Z[f];
    if (isConductor(api.getBlock(sx, y, sz))) checkCorner(api, sx, y + 1, sz);
    else checkCorner(api, sx, y - 1, sz);
  }
}

registerRedstone(REDSTONE_WIRE, {
  neighbor: (api, x, y, z, id) => updateWirePower(api, x, y, z, id),
  placed: (api, x, y, z, old, id) => {
    if (old > 0 && familyBase(old) === REDSTONE_WIRE) return;
    updateWirePower(api, x, y, z, id);
    for (const f of [UP, DOWN]) api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, REDSTONE_WIRE);
    updateNeighboringWires(api, x, y, z);
  },
  removed: (api, x, y, z, old, id, moved) => {
    if (moved || (id > 0 && familyBase(id) === REDSTONE_WIRE)) return;
    for (const f of JAVA_DIRECTIONS) api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, REDSTONE_WIRE);
    // updatePowerStrength con el estado viejo: ya no hay cable que cambiar, pero si su potencia no era la que le
    // tocaba en ese sitio, avisa igual (como Java).
    if (wireTarget(api, x, y, z) !== wirePower(old)) {
      const order = hashSetOrder(x, y, z, []);
      for (let i = 0; i < order.length; i += 3) api.updateNeighbors(order[i], order[i + 1], order[i + 2], -1, REDSTONE_WIRE);
    }
    updateNeighboringWires(api, x, y, z);
  },
});
