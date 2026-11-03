// Fase 7 (redstone): los raíles con la redstone, como en Minecraft Java.
// - Raíl propulsor y activador (PoweredRailBlock): cada uno se enciende si recibe potencia o si, siguiendo la
//   vía hacia delante o hacia atrás, hay hasta 8 raíles de su tipo encendidos seguidos que llegan a uno que la
//   recibe (findPoweredRailSignal). Al cambiar avisa a sus vecinos (opción 3), a los del bloque de debajo y, en
//   cuesta, a los del de encima: así se enciende o se apaga la línea raíl a raíl. Auditoría de la redstone:
//   antes se encendía la línea entera de una vez; el resultado es el mismo, el orden de los avisos no.
// - Raíl detector: con una vagoneta encima (lo enciende el transporte) da potencia 15 a su alrededor y
//   fuerte al bloque de debajo; el polvo se une a él.
// - Raíl normal en un cruce en T: un aviso de un emisor lo hace volver a elegir forma según la potencia que
//   recibe (updateDir de Java).
// Se importa por sus efectos (registra en api.ts) desde redstone/index.ts.
import {
  RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL, RAIL_KIND, RAIL_PLAIN, RAIL_SHAPE, RAIL_NS, RAIL_EW, RAIL_ASC_E, RAIL_ASC_W,
  RAIL_ASC_N, RAIL_ASC_S, railIsPowered, railState, isRail, familyBase,
} from '../blocks';
import { replanJunction } from '../rails';
import { registerRedstone, emitterOf, DOWN, type RedstoneApi } from './api';

const apply = (api: RedstoneApi, edits: readonly (readonly [number, number, number, number])[]) => {
  for (const [x, y, z, id] of edits) api.setBlock(x, y, z, id);
};

const isAscending = (shape: number) => shape >= RAIL_ASC_E && shape <= RAIL_ASC_S;

/** isSameRailWithPower de Java: el raíl de (x, y, z) es de su tipo, va en su eje, está encendido y le llega potencia (o sigue). */
function sameRailWithPower(api: RedstoneApi, kind: number, x: number, y: number, z: number, forward: boolean, depth: number, shape: number): boolean {
  const id = api.getBlock(x, y, z);
  if (id <= 0 || RAIL_KIND[id] !== kind) return false;
  const s = RAIL_SHAPE[id];
  if (shape === RAIL_EW && (s === RAIL_NS || s === RAIL_ASC_N || s === RAIL_ASC_S)) return false;
  if (shape === RAIL_NS && (s === RAIL_EW || s === RAIL_ASC_E || s === RAIL_ASC_W)) return false;
  if (!railIsPowered(id)) return false;
  return api.isPowered(x, y, z) || findPoweredRail(api, x, y, z, id, forward, depth + 1);
}

/** findPoweredRailSignal de Java: busca una fuente siguiendo la vía (hasta 8 raíles). */
function findPoweredRail(api: RedstoneApi, x: number, y: number, z: number, id: number, forward: boolean, depth: number): boolean {
  if (depth >= 8) return false;
  let i = x, j = y, k = z, below = true, shape = RAIL_SHAPE[id];
  switch (shape) {
    case RAIL_NS:
      k += forward ? 1 : -1;
      break;
    case RAIL_EW:
      i += forward ? -1 : 1;
      break;
    case RAIL_ASC_E:
      if (forward) i--;
      else { i++; j++; below = false; }
      shape = RAIL_EW;
      break;
    case RAIL_ASC_W:
      if (forward) { i--; j++; below = false; } else i++;
      shape = RAIL_EW;
      break;
    case RAIL_ASC_N:
      if (forward) k++;
      else { k--; j++; below = false; }
      shape = RAIL_NS;
      break;
    case RAIL_ASC_S:
      if (forward) { k++; j++; below = false; } else k--;
      shape = RAIL_NS;
      break;
  }
  const kind = RAIL_KIND[id];
  if (sameRailWithPower(api, kind, i, j, k, forward, depth, shape)) return true;
  return below && sameRailWithPower(api, kind, i, j - 1, k, forward, depth, shape);
}

/** updateState del raíl propulsor o activador. */
function updatePoweredRail(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const on = api.isPowered(x, y, z) || findPoweredRail(api, x, y, z, id, true, 0) || findPoweredRail(api, x, y, z, id, false, 0);
  if (on === railIsPowered(id)) return;
  api.setBlock(x, y, z, railState(RAIL_KIND[id], RAIL_SHAPE[id], on));
  api.updateNeighbors(x, y - 1, z, -1, id);
  if (isAscending(RAIL_SHAPE[id])) api.updateNeighbors(x, y + 1, z, -1, id);
}

/** onRemove de los raíles: en cuesta avisa arriba; los rectos (propulsor, activador, detector), también a sus vecinos y abajo. */
function railRemoved(api: RedstoneApi, x: number, y: number, z: number, old: number, _id: number, moved: boolean): void {
  // (En Java se llama también cuando el raíl sólo cambia de estado: lo decide el motor.)
  if (moved) return;
  if (isAscending(RAIL_SHAPE[old])) api.updateNeighbors(x, y + 1, z, -1, old);
  if (RAIL_KIND[old] !== RAIL_PLAIN) {
    api.updateNeighbors(x, y, z, -1, old);
    api.updateNeighbors(x, y - 1, z, -1, old);
  }
}

registerRedstone([POWERED_RAIL, ACTIVATOR_RAIL], {
  neighbor: (api, x, y, z, id) => updatePoweredRail(api, x, y, z, id),
  // onPlace → updateState: un raíl recto recién puesto se avisa a sí mismo.
  placed: (api, x, y, z, old, id) => {
    if (!(old > 0 && familyBase(old) === familyBase(id))) api.updateAt(x, y, z);
  },
  removed: railRemoved,
  changed: (api, x, y, z, old) => {
    if (old < 0) api.updateAt(x, y, z); // al cargar el chunk, que mire si le llega potencia
  },
});

registerRedstone(DETECTOR_RAIL, {
  emitter: {
    weak: (_v, _x, _y, _z, id) => (railIsPowered(id) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (face === DOWN && railIsPowered(id) ? 15 : 0),
  },
  removed: railRemoved,
});

/** ¿Tiene el raíl de (x, y, z) exactamente tres raíles alrededor? (countPotentialConnections de Java). */
function isJunction(api: RedstoneApi, x: number, y: number, z: number): boolean {
  let n = 0;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (const dy of [0, 1, -1]) {
      if (isRail(api.getBlock(x + dx, y + dy, z + dz))) {
        n++;
        break;
      }
    }
  }
  return n === 3;
}

registerRedstone(RAIL, {
  // updateState del raíl normal: sólo lo que avisa un emisor, y sólo en un cruce en T.
  neighbor: (api, x, y, z, id, _sx, _sy, _sz, src) => {
    if (RAIL_KIND[id] !== RAIL_PLAIN || !emitterOf(src) || !isJunction(api, x, y, z)) return;
    const get = (a: number, b: number, c: number) => api.getBlock(a, b, c);
    apply(api, replanJunction(get, x, y, z, api.isPowered(x, y, z)));
  },
  removed: railRemoved,
});
