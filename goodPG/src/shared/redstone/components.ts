// Fase 7 (redstone): lo que hace cada componente con la potencia, como en Minecraft (lo que emite está
// en blocks/redstoneBlocks.ts). Oyentes, ticks programados, lecturas de comparador, usos, pisadas y
// proyectiles de: antorchas (con su fundido), palanca, botones, placas de presión, gancho y cuerda,
// repetidor (retardo y bloqueo), comparador (comparar y restar), lámpara, bloque musical, sensor de
// luz solar, diana, pararrayos, bombilla de cobre, puertas, trampillas y portillos, campana y mena.
// Auditoría de la redstone: cada uno hace lo mismo que su clase de Java (neighborChanged, tick, onPlace,
// onRemove, updateShape), con sus mismas opciones de setBlock y avisando a los mismos bloques en el mismo
// orden (de eso dependen la cuasi-conectividad, los BUD y los pulsos cortos).
// Se importa por sus efectos (registra en api.ts) desde redstone/index.ts.
import {
  defs, familyBase, stateProps, stateOf, isDoor, isTrapdoor, isFenceGate, isBell, BLOCK_COUNT, CHEST, FURNACE, FURNACE_LIT,
  CHEST_DOUBLE, SMOKER, BLAST_FURNACE, BARREL, CAULDRON, WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON, cauldronFill,
  COMPOSTER, isJukebox, LECTERN, LECTERN_BOOK, CAKE, isCandleCake, isBeeHome, honeyLevel, CHISELED_BOOKSHELF, isChiseledShelf,
  GOLD_BLOCK, CLAY, PACKED_ICE, IRON_BLOCK, PUMPKIN, EMERALD_BLOCK, HAY_BALE, GLOWSTONE, BONE_BLOCK, BLOCKS,
} from '../blocks';
import {
  REDSTONE_TORCH, REDSTONE_WALL_TORCH, torchLit, torchWithLit, torchAttachFace, LEVER, BUTTONS, isWoodenButton, mountedPowered,
  mountedWithPowered, PRESSURE_PLATES, isPressurePlate, isWoodenPlate, LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE, platePower,
  REPEATER, isRepeater, repeaterDelay, repeaterLocked, repeaterWith, diodePowered, diodeOutFace, isDiode, COMPARATOR,
  comparatorSubtract, comparatorWith, REDSTONE_BLOCK, REDSTONE_LAMP, DAYLIGHT_DETECTOR, daylightInverted, daylightWith, TARGET,
  NOTE_BLOCK, noteOf, noteBlockWith, TRIPWIRE_HOOK, isTripwireHook, hookFacing, hookAttached, hookPowered, hookWith, TRIPWIRE,
  isTripwire, tripwirePowered, tripwireAttached, tripwireDisarmed, tripwireWith, TRAPPED_CHEST, TRAPPED_CHEST_DOUBLE,
  LIGHTNING_ROD, rodPowered, rodWith, rodFacing, COPPER_BULB, bulbLit, bulbPowered, bulbWith, isIronOpenable,
  LIT_REDSTONE_ORE, LIT_DEEPSLATE_REDSTONE_ORE, redstoneOreLit, isWire, wirePower, REDSTONE_WIRE, mountedAttachFace, isButton, isLever,
  wireConnections, wireDot,
} from '../blocks/redstoneBlocks';
import { DEEPSLATE_ORE, REDSTONE_ORE, BREWING_STAND } from '../blocks';
import {
  registerRedstone, isConductor, emitterOf, FACE_X, FACE_Y, FACE_Z, HFACE, JAVA_DIRECTIONS, DOWN, PRIORITY_EXTREMELY_HIGH,
  PRIORITY_VERY_HIGH, PRIORITY_HIGH, PRIORITY_NORMAL, UPDATE_CLIENTS, UPDATE_KNOWN_SHAPE, type RedstoneApi, type EntityFilter,
} from './api';
import { strongAt, signalFrom } from './signals';
import { redstoneUseState } from './use';
import { composterLevel } from '../composting';
import { maxStack, type ItemStack } from '../items';
import { DIR_X, DIR_Z, flatBoxes, unionBox } from '../blockModels';
import { posKey } from '../sim/posKey';

/** Vecinos relativos para las consultas de forma (polvo). */
const rel = (api: RedstoneApi, x: number, y: number, z: number) => (dx: number, dy: number, dz: number) => api.getBlock(x + dx, y + dy, z + dz);
const center = (api: RedstoneApi, kind: string, x: number, y: number, z: number, a?: number, b?: number) => api.fx(kind, x + 0.5, y + 0.5, z + 0.5, a, b);

// ------------------------------------------------------------------ antorchas

/** Retardo de una antorcha (un tick de redstone) y su fundido: 8 cambios en 60 ticks la apagan 160 ticks. */
const TORCH_DELAY = 2, BURNOUT_WINDOW = 60, BURNOUT_TOGGLES = 8, BURNOUT_WAIT = 160;
/** Cambios recientes de las antorchas (RECENT_TOGGLES de Java: una lista por mundo, en orden). */
const TOGGLES = new WeakMap<RedstoneApi, { k: number; t: number }[]>();

function toggleList(api: RedstoneApi): { k: number; t: number }[] {
  let l = TOGGLES.get(api);
  if (!l) TOGGLES.set(api, (l = []));
  return l;
}

/** isToggledTooFrequently de Java: apunta el cambio (si toca) y dice si esa antorcha lleva 8 en la lista. */
function toggledTooOften(api: RedstoneApi, x: number, y: number, z: number, log: boolean): boolean {
  const l = toggleList(api), k = posKey(x, y, z);
  if (log) l.push({ k, t: api.gameTick });
  let n = 0;
  for (const e of l) if (e.k === k && ++n >= BURNOUT_TOGGLES) return true;
  return false;
}

/** ¿Le llega potencia a la antorcha desde el bloque en el que se apoya? (hasNeighborSignal de la antorcha). */
function torchPowered(api: RedstoneApi, x: number, y: number, z: number, id: number): boolean {
  return api.powerFrom(x, y, z, torchAttachFace(id)) > 0;
}

/** Avisa a los vecinos de sus seis vecinos (onPlace y onRemove de la antorcha en Java). */
function updateAround(api: RedstoneApi, x: number, y: number, z: number, src: number): void {
  for (const f of JAVA_DIRECTIONS) api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, src);
}

registerRedstone([REDSTONE_TORCH, REDSTONE_WALL_TORCH], {
  neighbor: (api, x, y, z, id) => {
    if (torchLit(id) === torchPowered(api, x, y, z, id) && !api.willTickNow(x, y, z)) api.schedule(x, y, z, TORCH_DELAY);
  },
  tick: (api, x, y, z, id) => {
    const powered = torchPowered(api, x, y, z, id);
    const l = toggleList(api);
    while (l.length && api.gameTick - l[0].t > BURNOUT_WINDOW) l.shift();
    if (torchLit(id)) {
      if (!powered) return;
      api.setBlock(x, y, z, torchWithLit(id, false));
      if (toggledTooOften(api, x, y, z, true)) {
        // Se funde: humo y chisporroteo; vuelve a mirar dentro de un rato.
        api.fx('torch_burnout', x + 0.5, y + 0.7, z + 0.5);
        api.schedule(x, y, z, BURNOUT_WAIT);
      }
    } else if (!powered && !toggledTooOften(api, x, y, z, false)) api.setBlock(x, y, z, torchWithLit(id, true));
  },
  placed: (api, x, y, z, _old, id) => updateAround(api, x, y, z, id),
  removed: (api, x, y, z, old, id, moved) => {
    if (!moved && !(id > 0 && (familyBase(id) === REDSTONE_TORCH || familyBase(id) === REDSTONE_WALL_TORCH))) updateAround(api, x, y, z, old);
  },
  changed: (api, x, y, z, old) => {
    if (old < 0) api.updateAt(x, y, z); // al cargar el chunk, que mire si le toca cambiar
  },
});

// ------------------------------------------------------------------ palanca y botones

/** updateNeighbours de la palanca y los botones: sus vecinos y los del bloque en el que se apoyan. */
function updateMounted(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  api.updateNeighbors(x, y, z, -1, id);
  const f = mountedAttachFace(id);
  api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, id);
}

/** onRemove de la palanca y los botones: si estaban encendidos, avisan (salvo que los mueva un pistón). */
const mountedRemoved = (api: RedstoneApi, x: number, y: number, z: number, old: number, id: number, moved: boolean) => {
  if (!moved && !(id > 0 && familyBase(id) === familyBase(old)) && mountedPowered(old)) updateMounted(api, x, y, z, old);
};

registerRedstone(LEVER, {
  use: (api, x, y, z, id) => {
    const on = !mountedPowered(id);
    const next = mountedWithPowered(id, on);
    api.setBlock(x, y, z, next);
    updateMounted(api, x, y, z, next);
    center(api, 'lever', x, y, z, on ? 1 : 0);
    return true;
  },
  removed: mountedRemoved,
});

/** Ticks que se queda pulsado un botón: 20 el de piedra y 30 los de madera. */
const buttonTicks = (id: number) => (isWoodenButton(id) ? 30 : 20);

/** ¿Hay flechas clavadas en el botón (de madera)? Caja del botón un poco agrandada. */
function arrowsOn(api: RedstoneApi, x: number, y: number, z: number, id: number): boolean {
  const b = unionBox(flatBoxes(defs[id].model ?? []));
  const m = 0.15;
  return api.countEntities(x + b[0] - m, y + b[1] - m, z + b[2] - m, x + b[3] + m, y + b[4] + m, z + b[5] + m, 'arrows') > 0;
}

/** press de Java: se enciende, avisa y se apaga solo al cabo de su tiempo. */
function pressButton(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  if (mountedPowered(id)) return;
  const next = mountedWithPowered(id, true);
  api.setBlock(x, y, z, next);
  updateMounted(api, x, y, z, next);
  api.schedule(x, y, z, buttonTicks(id));
  center(api, 'button', x, y, z, 1, isWoodenButton(id) ? 1 : 0);
}

/** checkPressed de Java: pulsado mientras tenga una flecha (los de madera); si cambia, avisa. */
function checkButton(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const arrow = isWoodenButton(id) && arrowsOn(api, x, y, z, id);
  if (arrow !== mountedPowered(id)) {
    const next = mountedWithPowered(id, arrow);
    api.setBlock(x, y, z, next);
    updateMounted(api, x, y, z, next);
    center(api, 'button', x, y, z, arrow ? 1 : 0, isWoodenButton(id) ? 1 : 0);
  }
  if (arrow) api.schedule(x, y, z, buttonTicks(id));
}

registerRedstone(Object.values(BUTTONS), {
  use: (api, x, y, z, id) => {
    pressButton(api, x, y, z, id);
    return true;
  },
  tick: (api, x, y, z, id) => {
    if (mountedPowered(id)) checkButton(api, x, y, z, id);
  },
  removed: mountedRemoved,
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && mountedPowered(id)) api.schedule(x, y, z, buttonTicks(id));
  },
});

/** Una flecha (o un tridente) toca un botón de madera (entityInside de Java): lo pulsa. Lo llama el motor. */
export function arrowOnButton(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  if (isWoodenButton(id) && !mountedPowered(id)) checkButton(api, x, y, z, id);
}

// ------------------------------------------------------------------ placas de presión

/** Material de una placa para el sonido: 0 piedra, 1 madera, 2 metal. */
const plateSound = (id: number) => (isWoodenPlate(id) ? 1 : isPressurePlate(id) ? 0 : 2);

/** updateNeighbours de las placas: sus vecinos y los del bloque de debajo. */
function updatePlate(api: RedstoneApi, x: number, y: number, z: number, src: number): void {
  api.updateNeighbors(x, y, z, -1, src);
  api.updateNeighbors(x, y - 1, z, -1, src);
}

/** checkPressed de Java: cuenta lo que hay encima y pone su potencia (sin avisar al cambiar, y avisa después). */
function checkPlate(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const base = familyBase(id);
  const weighted = base === LIGHT_WEIGHTED_PLATE || base === HEAVY_WEIGHTED_PLATE;
  const filter: EntityFilter = weighted || isWoodenPlate(id) ? 'all' : 'living';
  const n = api.countEntities(x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + 0.25, z + 15 / 16, filter);
  let p: number;
  if (!weighted) p = n > 0 ? 15 : 0;
  else if (base === LIGHT_WEIGHTED_PLATE) p = Math.min(n, 15);
  else p = Math.ceil(Math.min(n, 150) / 10);
  const cur = platePower(id);
  if (p !== cur) {
    api.setBlock(x, y, z, weighted ? base + p : base + (p > 0 ? 1 : 0), UPDATE_CLIENTS);
    updatePlate(api, x, y, z, id);
  }
  if ((p > 0) !== (cur > 0)) center(api, 'plate', x, y - 0.4, z, p > 0 ? 1 : 0, plateSound(id));
  if (p > 0) api.schedule(x, y, z, weighted ? 10 : 20);
}

registerRedstone([...Object.values(PRESSURE_PLATES), LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE], {
  // entityInside de Java: sólo mira si está sin pisar (luego, su tick vuelve a mirar mientras siga pisada).
  stepped: (api, x, y, z, id) => {
    if (platePower(id) === 0) checkPlate(api, x, y, z, id);
  },
  tick: (api, x, y, z, id) => {
    if (platePower(id) > 0) checkPlate(api, x, y, z, id);
  },
  removed: (api, x, y, z, old, id, moved) => {
    if (!moved && !(id > 0 && familyBase(id) === familyBase(old)) && platePower(old) > 0) updatePlate(api, x, y, z, old);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && platePower(id) > 0) api.schedule(x, y, z, 1);
  },
});

// ------------------------------------------------------------------ gancho y cuerda

/** Distancia máxima entre dos ganchos (Minecraft: 40 cuerdas entre medias). */
const HOOK_RANGE = 42;

/**
 * Recalcula un gancho (calculateState de Minecraft): está tendido si hay otro gancho de frente a más
 * de un bloque con sólo cuerda entre medias; se activa si alguna cuerda (no cortada) está pisada.
 * `pulse`: la cuerda de esa posición cuenta como pisada aunque ya no esté (romperla sin tijeras).
 */
function updateHook(api: RedstoneApi, x: number, y: number, z: number, pulse = -1): void {
  const hid = api.getBlock(x, y, z);
  if (!isTripwireHook(hid)) return;
  const f = hookFacing(hid), dx = DIR_X[f], dz = DIR_Z[f];
  let intact = true, powered = false, partner = -1;
  for (let k = 1; k < HOOK_RANGE; k++) {
    const cx = x + dx * k, cz = z + dz * k;
    const b = api.getBlock(cx, y, cz);
    if (k === pulse) {
      powered = true;
      continue;
    }
    if (isTripwireHook(b)) {
      if (hookFacing(b) === ((f + 2) & 3)) partner = k;
      break;
    }
    if (isTripwire(b)) {
      if (tripwirePowered(b) && !tripwireDisarmed(b)) powered = true;
      continue;
    }
    intact = false;
  }
  const attached = intact && partner > 1;
  powered &&= attached;
  const setHook = (hx: number, hz: number, id: number) => {
    const next = hookWith(id, attached, powered);
    if (next === id) return;
    api.setBlock(hx, y, hz, next);
    // notifyNeighbors de Java: sus vecinos (ya avisados por el setBlock) y los del bloque en el que se apoya.
    if (hookPowered(id) !== powered) {
      const back = HFACE[(hookFacing(next) + 2) & 3];
      api.updateNeighbors(hx, y, hz, -1, next);
      api.updateNeighbors(hx + FACE_X[back], y, hz + FACE_Z[back], -1, next);
    }
    // Clic al tensarse, al soltarse y al activarse o desactivarse.
    center(api, 'tripwire', hx, y, hz, hookPowered(id) !== powered ? (powered ? 1 : 0) : attached ? 2 : 3);
  };
  setHook(x, z, hid);
  if (partner < 0) return;
  const px = x + dx * partner, pz = z + dz * partner;
  setHook(px, pz, api.getBlock(px, y, pz));
  for (let k = 1; k < partner; k++) {
    const cx = x + dx * k, cz = z + dz * k;
    const b = api.getBlock(cx, y, cz);
    if (isTripwire(b) && tripwireAttached(b) !== attached) {
      api.setBlock(cx, y, cz, tripwireWith(tripwirePowered(b), attached, tripwireDisarmed(b)));
    }
  }
}

/** Ganchos a los que llega la línea de cuerda que pasa por (x, y, z), con su distancia a ella. */
function hooksAround(api: RedstoneApi, x: number, y: number, z: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let d = 0; d < 4; d++) {
    for (let k = 1; k < HOOK_RANGE; k++) {
      const cx = x + DIR_X[d] * k, cz = z + DIR_Z[d] * k;
      const b = api.getBlock(cx, y, cz);
      if (isTripwireHook(b)) {
        if (hookFacing(b) === ((d + 2) & 3)) out.push([cx, cz, k]);
        break;
      }
      if (!isTripwire(b)) break;
    }
  }
  return out;
}

function checkTripwire(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const on = api.countEntities(x, y, z, x + 1, y + 0.16, z + 1, 'all') > 0;
  if (on !== tripwirePowered(id)) api.setBlock(x, y, z, tripwireWith(on, tripwireAttached(id), tripwireDisarmed(id)));
  if (on) api.schedule(x, y, z, 10);
}

registerRedstone(TRIPWIRE, {
  stepped: (api, x, y, z, id) => {
    if (!tripwirePowered(id)) checkTripwire(api, x, y, z, id);
  },
  tick: (api, x, y, z, id) => {
    if (tripwirePowered(id)) checkTripwire(api, x, y, z, id);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0) {
      if (tripwirePowered(id)) api.schedule(x, y, z, 1);
      return;
    }
    const was = isTripwire(old), now = isTripwire(id);
    // Sólo cuenta ponerla, quitarla, pisarla o cortarla (no que se tense: eso lo hacen los ganchos).
    if (was && now && tripwirePowered(old) === tripwirePowered(id) && tripwireDisarmed(old) === tripwireDisarmed(id)) return;
    const hooks = hooksAround(api, x, y, z);
    // Romperla sin tijeras estando tendida da un pulso (como en Minecraft).
    const pulse = was && !now && tripwireAttached(old) && !tripwireDisarmed(old);
    for (const [hx, hz, k] of hooks) {
      updateHook(api, hx, y, hz, pulse ? k : -1);
      if (pulse) api.schedule(hx, y, hz, 10);
    }
  },
});

registerRedstone(TRIPWIRE_HOOK, {
  tick: (api, x, y, z) => updateHook(api, x, y, z),
  // onRemove de Java: si estaba activado, avisa a sus vecinos y a los del bloque en el que se apoyaba.
  removed: (api, x, y, z, old, id, moved) => {
    if (moved || isTripwireHook(id) || !hookPowered(old)) return;
    const back = HFACE[(hookFacing(old) + 2) & 3];
    api.updateNeighbors(x, y, z, -1, old);
    api.updateNeighbors(x + FACE_X[back], y, z + FACE_Z[back], -1, old);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0) {
      if (hookPowered(id)) api.schedule(x, y, z, 1);
      return;
    }
    if (isTripwireHook(old) && isTripwireHook(id)) return;
    if (isTripwireHook(id)) updateHook(api, x, y, z);
    else {
      // Gancho quitado: el de enfrente se suelta y la cuerda se destensa.
      const f = hookFacing(old);
      for (let k = 1; k < HOOK_RANGE; k++) {
        const cx = x + DIR_X[f] * k, cz = z + DIR_Z[f] * k;
        const b = api.getBlock(cx, y, cz);
        if (isTripwireHook(b)) {
          updateHook(api, cx, y, cz);
          break;
        }
        if (!isTripwire(b)) break;
        if (tripwireAttached(b)) api.setBlock(cx, y, cz, tripwireWith(tripwirePowered(b), false, tripwireDisarmed(b)));
      }
    }
  },
});

// ------------------------------------------------------------------ repetidor y comparador

const faceX = (x: number, f: number) => x + FACE_X[f], faceY = (y: number, f: number) => y + FACE_Y[f], faceZ = (z: number, f: number) => z + FACE_Z[f];

/** getInputSignal de DiodeBlock: la potencia que entra por detrás (o la del polvo que haya detrás, aunque no se una). */
function backSignal(api: RedstoneApi, x: number, y: number, z: number, id: number): number {
  const back = diodeOutFace(id) ^ 1;
  const i = signalFrom(api, x, y, z, back);
  if (i >= 15) return i;
  return Math.max(i, wirePowerAt(api, faceX(x, back), faceY(y, back), faceZ(z, back)));
}

const wirePowerAt = (api: RedstoneApi, x: number, y: number, z: number) => {
  const b = api.getBlock(x, y, z);
  return isWire(b) ? wirePower(b) : 0;
};

/** Las dos caras laterales de un repetidor o un comparador (en el orden de Java: a la derecha y a la izquierda). */
const sideFaces = (id: number) => {
  const o = HFACE.indexOf(diodeOutFace(id) ^ 1); // FACING de Java: hacia la entrada
  return [HFACE[(o + 1) & 3], HFACE[(o + 3) & 3]];
};

/**
 * getControlInputSignal de Java por un lado: sólo repetidores y comparadores (los del repetidor), o además el
 * bloque de redstone (15), el polvo (su potencia) y cualquier emisor (su potencia fuerte).
 */
function controlInput(api: RedstoneApi, x: number, y: number, z: number, f: number, diodesOnly: boolean): number {
  const nx = faceX(x, f), ny = faceY(y, f), nz = faceZ(z, f);
  const b = api.getBlock(nx, ny, nz);
  if (diodesOnly) return isDiode(b) ? strongAt(api, nx, ny, nz, f ^ 1) : 0;
  if (b === REDSTONE_BLOCK) return 15;
  if (isWire(b)) return wirePower(b);
  return emitterOf(b) ? strongAt(api, nx, ny, nz, f ^ 1) : 0;
}

/** getAlternateSignal de Java: lo que entra por los lados. */
function sideSignal(api: RedstoneApi, x: number, y: number, z: number, id: number, diodesOnly: boolean): number {
  let best = 0;
  for (const f of sideFaces(id)) best = Math.max(best, controlInput(api, x, y, z, f, diodesOnly));
  return best;
}

/** isLocked del repetidor: le da de lado un repetidor o un comparador encendido. */
const repeaterSideLocked = (api: RedstoneApi, x: number, y: number, z: number, id: number) => sideSignal(api, x, y, z, id, true) > 0;

/** shouldPrioritize de Java: tiene delante otro repetidor o comparador que no le mira. */
function prioritized(api: RedstoneApi, x: number, y: number, z: number, id: number): boolean {
  const out = diodeOutFace(id);
  const front = api.getBlock(faceX(x, out), faceY(y, out), faceZ(z, out));
  return isDiode(front) && diodeOutFace(front) !== (out ^ 1);
}

/** updateNeighborsInFront de Java: el bloque de delante y sus vecinos (menos el propio diodo). */
function updateFront(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const out = diodeOutFace(id);
  const fx = faceX(x, out), fy = faceY(y, out), fz = faceZ(z, out);
  api.updateAt(fx, fy, fz, x, y, z, id);
  api.updateNeighbors(fx, fy, fz, out ^ 1, id);
}

/** ¿Es el mismo tipo de diodo (repetidor con repetidor, comparador con comparador)? */
const sameDiode = (a: number, b: number) => a > 0 && b > 0 && familyBase(a) === familyBase(b);

registerRedstone(REPEATER, {
  // checkTickOnNeighbor de DiodeBlock.
  neighbor: (api, x, y, z, id) => {
    if (repeaterSideLocked(api, x, y, z, id)) return;
    const on = backSignal(api, x, y, z, id) > 0;
    if (on === diodePowered(id) || api.willTickNow(x, y, z)) return;
    const prio = prioritized(api, x, y, z, id) ? PRIORITY_EXTREMELY_HIGH : diodePowered(id) ? PRIORITY_VERY_HIGH : PRIORITY_HIGH;
    api.schedule(x, y, z, (repeaterDelay(id) + 1) * 2, prio);
  },
  // El bloqueo va por la forma (updateShape): lo que cambia a un lado.
  shape: (api, x, y, z, id, face) => {
    if (face === diodeOutFace(id) || face === (diodeOutFace(id) ^ 1)) return id;
    return repeaterWith(id, diodePowered(id), repeaterSideLocked(api, x, y, z, id));
  },
  tick: (api, x, y, z, id) => {
    if (repeaterSideLocked(api, x, y, z, id)) return;
    const on = backSignal(api, x, y, z, id) > 0;
    if (diodePowered(id) && !on) api.setBlock(x, y, z, repeaterWith(id, false, repeaterLocked(id)), UPDATE_CLIENTS);
    else if (!diodePowered(id)) {
      api.setBlock(x, y, z, repeaterWith(id, true, repeaterLocked(id)), UPDATE_CLIENTS);
      // El pulso dura al menos el retardo del repetidor.
      if (!on) api.schedule(x, y, z, (repeaterDelay(id) + 1) * 2, PRIORITY_VERY_HIGH);
    }
  },
  use: (api, x, y, z, id) => {
    api.setBlock(x, y, z, redstoneUseState(id, rel(api, x, y, z))!);
    center(api, 'repeater', x, y, z);
    return true;
  },
  // onPlace: cualquier cambio de estado avisa delante; recién puesto con entrada, se enciende en 1 tick (setPlacedBy).
  placed: (api, x, y, z, old, id) => {
    if (sameDiode(old, id)) {
      updateFront(api, x, y, z, id);
      return;
    }
    // getStateForPlacement: nace ya bloqueado si le da de lado otro diodo (el cambio avisa delante él solo).
    const locked = repeaterSideLocked(api, x, y, z, id);
    if (locked !== repeaterLocked(id)) api.setBlock(x, y, z, repeaterWith(id, diodePowered(id), locked), UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE);
    else updateFront(api, x, y, z, id);
    // setPlacedBy: con entrada, se enciende en 1 tick.
    if (!diodePowered(id) && backSignal(api, x, y, z, id) > 0) api.schedule(x, y, z, 1);
  },
  removed: (api, x, y, z, old, id, moved) => {
    if (!moved && !sameDiode(old, id)) updateFront(api, x, y, z, old);
  },
  changed: (api, x, y, z, old) => {
    if (old < 0) api.updateAt(x, y, z);
  },
});

/** getInputSignal del comparador: la de detrás o, si lo hay, lo que lee de un contenedor (también a través de un bloque). */
function comparatorInput(api: RedstoneApi, x: number, y: number, z: number, id: number): number {
  const back = diodeOutFace(id) ^ 1;
  let i = backSignal(api, x, y, z, id);
  const bx = faceX(x, back), by = faceY(y, back), bz = faceZ(z, back);
  const direct = api.analog(bx, by, bz);
  if (direct >= 0) return direct;
  if (i < 15 && isConductor(api.getBlock(bx, by, bz))) {
    const cx = faceX(bx, back), cy = faceY(by, back), cz = faceZ(bz, back);
    const j = Math.max(api.analog(cx, cy, cz), api.frameSignal(cx, cy, cz));
    if (j >= 0) i = j;
  }
  return i;
}

/** calculateOutputSignal de Java. */
function comparatorOutput(api: RedstoneApi, x: number, y: number, z: number, id: number): number {
  const i = comparatorInput(api, x, y, z, id);
  if (i === 0) return 0;
  const j = sideSignal(api, x, y, z, id, false);
  if (j > i) return 0;
  return comparatorSubtract(id) ? i - j : i;
}

/** shouldTurnOn del comparador. */
function comparatorOn(api: RedstoneApi, x: number, y: number, z: number, id: number): boolean {
  const i = comparatorInput(api, x, y, z, id);
  if (i === 0) return false;
  const j = sideSignal(api, x, y, z, id, false);
  return i > j || (i === j && !comparatorSubtract(id));
}

/** refreshOutputState de Java: guarda la salida nueva, se enciende o apaga (sin avisar) y avisa delante. */
function refreshComparator(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const out = comparatorOutput(api, x, y, z, id);
  const old = api.getData(x, y, z);
  api.setData(x, y, z, out);
  if (old === out && comparatorSubtract(id)) return;
  const on = comparatorOn(api, x, y, z, id);
  if (diodePowered(id) !== on) api.setBlock(x, y, z, (id = comparatorWith(id, on)), UPDATE_CLIENTS);
  updateFront(api, x, y, z, id);
}

registerRedstone(COMPARATOR, {
  // checkTickOnNeighbor del comparador.
  neighbor: (api, x, y, z, id) => {
    if (api.willTickNow(x, y, z)) return;
    const out = comparatorOutput(api, x, y, z, id);
    if (out === api.getData(x, y, z) && diodePowered(id) === comparatorOn(api, x, y, z, id)) return;
    api.schedule(x, y, z, 2, prioritized(api, x, y, z, id) ? PRIORITY_HIGH : PRIORITY_NORMAL);
  },
  tick: refreshComparator,
  use: (api, x, y, z, id) => {
    const next = redstoneUseState(id, rel(api, x, y, z))!;
    api.setBlock(x, y, z, next, UPDATE_CLIENTS);
    center(api, 'comparator', x, y, z, comparatorSubtract(next) ? 1 : 0);
    refreshComparator(api, x, y, z, next);
    return true;
  },
  placed: (api, x, y, z, old, id) => {
    updateFront(api, x, y, z, id);
    if (!sameDiode(old, id) && old >= 0 && comparatorOn(api, x, y, z, id)) api.schedule(x, y, z, 1);
  },
  removed: (api, x, y, z, old, id, moved) => {
    if (!moved && !sameDiode(old, id)) updateFront(api, x, y, z, old);
  },
  changed: (api, x, y, z, old) => {
    if (old < 0) api.schedule(x, y, z, 1);
  },
});

// ------------------------------------------------------------------ lámpara, bloque musical, sensor y diana

const lampLit = (id: number) => id === REDSTONE_LAMP + 1;
registerRedstone(REDSTONE_LAMP, {
  // Se enciende al momento y tarda 4 ticks en apagarse; cambia sin avisar a nadie (opción 2), como en Java.
  neighbor: (api, x, y, z, id) => {
    const powered = api.isPowered(x, y, z);
    if (lampLit(id) === powered) return;
    if (lampLit(id)) api.schedule(x, y, z, 4);
    else api.setBlock(x, y, z, REDSTONE_LAMP + 1, UPDATE_CLIENTS);
  },
  tick: (api, x, y, z, id) => {
    if (lampLit(id) && !api.isPowered(x, y, z)) api.setBlock(x, y, z, REDSTONE_LAMP, UPDATE_CLIENTS);
  },
  // getStateForPlacement: se pone ya encendida si recibe potencia.
  placed: (api, x, y, z, old, id) => {
    if (old >= 0 && familyBase(old) !== REDSTONE_LAMP && !lampLit(id) && api.isPowered(x, y, z)) {
      api.setBlock(x, y, z, REDSTONE_LAMP + 1, UPDATE_CLIENTS | UPDATE_KNOWN_SHAPE);
    }
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0) api.updateAt(x, y, z);
  },
});

/** Instrumentos del bloque musical (el índice viaja en el efecto 'note'). */
export const INSTRUMENTS = [
  'harp', 'basedrum', 'snare', 'hat', 'bass', 'flute', 'bell', 'guitar', 'chime', 'xylophone', 'iron_xylophone', 'cow_bell',
  'didgeridoo', 'bit', 'banjo', 'pling',
] as const;
const INSTRUMENT_OF = new Map<number, number>([
  [GOLD_BLOCK, 6], [CLAY, 5], [PACKED_ICE, 8], [BONE_BLOCK, 9], [IRON_BLOCK, 10], [PUMPKIN, 12], [EMERALD_BLOCK, 13],
  [HAY_BALE, 14], [GLOWSTONE, 15],
]);

/** Instrumento según el bloque de debajo (como en Minecraft; por el material si no es uno especial). */
export function noteInstrument(below: number): number {
  if (below <= 0) return 0;
  const special = INSTRUMENT_OF.get(familyBase(below));
  if (special !== undefined) return special;
  switch (BLOCKS[below]?.sound) {
    case 'wood': return 4;
    case 'stone': return 1;
    case 'sand':
    case 'gravel': return 2;
    case 'glass': return 3;
    case 'wool': return 7;
  }
  return 0;
}

/** Toca la nota (sólo con aire encima). */
function playNote(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  if (api.getBlock(x, y + 1, z) !== 0) return;
  api.fx('note', x + 0.5, y + 1.2, z + 0.5, noteInstrument(api.getBlock(x, y - 1, z)), noteOf(id));
}

registerRedstone(NOTE_BLOCK, {
  neighbor: (api, x, y, z, id) => {
    const powered = api.isPowered(x, y, z), was = id - NOTE_BLOCK >= 25;
    if (powered === was) return;
    if (powered) playNote(api, x, y, z, id);
    api.setBlock(x, y, z, noteBlockWith(noteOf(id), powered));
  },
  use: (api, x, y, z, id) => {
    const next = redstoneUseState(id, rel(api, x, y, z))!;
    api.setBlock(x, y, z, next);
    playNote(api, x, y, z, next);
    return true;
  },
});

/** Actualiza la potencia de un sensor de luz solar. */
function updateDetector(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const inverted = daylightInverted(id);
  const next = daylightWith(id, api.sunlight(x, y, z, inverted), inverted);
  if (next !== id) api.setBlock(x, y, z, next);
}

registerRedstone(DAYLIGHT_DETECTOR, {
  periodic: { every: 20, run: updateDetector },
  use: (api, x, y, z, id) => {
    const next = redstoneUseState(id, rel(api, x, y, z))!;
    api.setBlock(x, y, z, next);
    center(api, 'comparator', x, y, z, daylightInverted(next) ? 1 : 0);
    updateDetector(api, x, y, z, next);
    return true;
  },
});

registerRedstone(TARGET, {
  // La potencia depende de lo cerca del centro que da: 15 en el centro, 1 en el borde.
  projectile: (api, x, y, z, id, px, py, pz, kind) => {
    if (api.isScheduled(x, y, z)) return;
    const d = [px - x - 0.5, py - y - 0.5, pz - z - 0.5];
    // El eje de la cara tocada es aquel por el que el punto quedó fuera del bloque.
    let axis = 0;
    for (let a = 1; a < 3; a++) if (Math.abs(d[a]) > Math.abs(d[axis])) axis = a;
    const g = Math.max(...d.filter((_, a) => a !== axis).map(Math.abs));
    const power = Math.max(1, Math.ceil(15 * Math.max(0, Math.min(1, (0.5 - g) / 0.5))));
    api.setBlock(x, y, z, TARGET + power);
    api.schedule(x, y, z, kind === 'thrown' ? 8 : 20);
    center(api, 'target', x, y, z, power);
    void id;
  },
  tick: (api, x, y, z, id) => {
    if (id !== TARGET) api.setBlock(x, y, z, TARGET);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && id > TARGET) api.schedule(x, y, z, 1);
  },
});

// ------------------------------------------------------------------ cobre: pararrayos y bombilla

/** updateNeighbours del pararrayos: los vecinos del bloque de su base. */
export function updateRodBase(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const f = rodFacing(id) ^ 1;
  api.updateNeighbors(x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], -1, id);
}

registerRedstone(LIGHTNING_ROD.flat(), {
  tick: (api, x, y, z, id) => {
    if (!rodPowered(id)) return;
    api.setBlock(x, y, z, rodWith(id, false));
    updateRodBase(api, x, y, z, id);
  },
  removed: (api, x, y, z, old, id, moved) => {
    if (!moved && rodPowered(old) && !(id > 0 && familyBase(id) === familyBase(old))) updateRodBase(api, x, y, z, old);
  },
  changed: (api, x, y, z, old, id) => {
    if (old < 0 && rodPowered(id)) api.schedule(x, y, z, 1);
  },
});

/** checkAndFlip de Java: cambia de encendida a apagada con cada pulso (al empezar a recibir potencia). */
function flipBulb(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const powered = api.isPowered(x, y, z);
  if (powered === bulbPowered(id)) return;
  let lit = bulbLit(id);
  if (powered) {
    lit = !lit;
    center(api, 'bulb', x, y, z, lit ? 1 : 0);
  }
  api.setBlock(x, y, z, bulbWith(id, lit, powered));
}

registerRedstone(COPPER_BULB.flat(), {
  neighbor: (api, x, y, z, id) => flipBulb(api, x, y, z, id),
  placed: (api, x, y, z, old, id) => {
    if (old >= 0 && !(old > 0 && familyBase(old) === familyBase(id))) flipBulb(api, x, y, z, id);
  },
  analog: (_api, _x, _y, _z, id) => (bulbLit(id) ? 15 : 0),
});

// ------------------------------------------------------------------ puertas, trampillas, portillos y campana

/**
 * La potencia abre y cierra puertas, trampillas y portillos al cambiar (como la propiedad `powered` de
 * Minecraft, que aquí guarda el motor por posición): una puerta abierta a mano sigue abierta hasta
 * que llega o se va la potencia. Las de hierro sólo se abren así. Como en Java, cambian sin avisar a sus
 * vecinos (opción 2); el cambio de `powered` sin cambio de bloque se notifica como si lo hubiera (formas).
 */
function openableNeighbor(api: RedstoneApi, x: number, y: number, z: number, id: number, _sx: number, _sy: number, _sz: number, src: number): void {
  const st = stateProps(id)!;
  const base = familyBase(id);
  let ly = y;
  let powered: boolean;
  if (isDoor(id)) {
    // Las puertas no atienden los avisos de una puerta de su tipo (su otra mitad).
    if (src > 0 && familyBase(src) === base) return;
    ly = st.half === 0 ? y : y - 1;
    powered = api.isPowered(x, ly, z) || api.isPowered(x, ly + 1, z);
  } else powered = api.isPowered(x, y, z);
  const was = api.getData(x, ly, z) === 1;
  if (powered === was) return;
  api.setData(x, ly, z, powered ? 1 : 0);
  if ((st.open === 1) === powered) {
    api.stateTouched(x, y, z, UPDATE_CLIENTS);
    return;
  }
  const open = powered ? 1 : 0;
  if (isDoor(id)) {
    const lower = api.getBlock(x, ly, z), upper = api.getBlock(x, ly + 1, z);
    if (familyBase(lower) === base) api.setBlock(x, ly, z, stateOf(base, { ...stateProps(lower)!, open }), UPDATE_CLIENTS);
    if (familyBase(upper) === base) api.setBlock(x, ly + 1, z, stateOf(base, { ...stateProps(upper)!, open }), UPDATE_CLIENTS);
  } else api.setBlock(x, y, z, stateOf(base, { ...st, open }), UPDATE_CLIENTS);
  // Sonido de abrir o cerrar (b: 1 si es de metal).
  const metal = isIronOpenable(id) || BLOCKS[id].sound === 'metal';
  center(api, 'openable', x, y, z, open, (metal ? 1 : 0) + (isDoor(id) ? 0 : isTrapdoor(id) ? 2 : 4));
}

const OPENABLES: number[] = [];
for (let id = 1; id < BLOCK_COUNT; id++) {
  if (defs[id] && familyBase(id) === id && (isDoor(id) || isTrapdoor(id) || isFenceGate(id))) OPENABLES.push(id);
}
registerRedstone(OPENABLES, { neighbor: openableNeighbor });

const BELLS: number[] = [];
for (let id = 1; id < BLOCK_COUNT; id++) if (defs[id] && familyBase(id) === id && isBell(id)) BELLS.push(id);
registerRedstone(BELLS, {
  // Suena al empezar a recibir potencia; `powered` cambia con la opción 3 (avisa a sus vecinos), como en Java.
  neighbor: (api, x, y, z) => {
    const powered = api.isPowered(x, y, z);
    if (powered === (api.getData(x, y, z) === 1)) return;
    if (powered) api.fx('bell', x + 0.5, y + 0.5, z + 0.5);
    api.setData(x, y, z, powered ? 1 : 0);
    api.stateTouched(x, y, z);
  },
});

// ------------------------------------------------------------------ mena de redstone

/** Se enciende al pisarla o tocarla (y se apaga sola con los ticks aleatorios). */
function lightOre(api: RedstoneApi, x: number, y: number, z: number, id: number): void {
  const lit = redstoneOreLit(id, true);
  if (lit && lit !== id) api.setBlock(x, y, z, lit);
}
const ORE_USE = (api: RedstoneApi, x: number, y: number, z: number, id: number) => {
  lightOre(api, x, y, z, id);
  return true;
};
registerRedstone([REDSTONE_ORE, DEEPSLATE_ORE[REDSTONE_ORE], LIT_REDSTONE_ORE, LIT_DEEPSLATE_REDSTONE_ORE], {
  stepped: lightOre,
  use: ORE_USE,
});

// ------------------------------------------------------------------ lecturas de comparador

/** Lo lleno que está un contenedor (0..15), como en Minecraft. */
export function containerSignal(slots: readonly (ItemStack | null)[] | null): number {
  if (!slots || slots.length === 0) return 0;
  let f = 0, any = false;
  for (const s of slots) {
    if (!s || s.count <= 0) continue;
    f += s.count / Math.min(64, maxStack(s.id));
    any = true;
  }
  return Math.floor((f / slots.length) * 14) + (any ? 1 : 0);
}

const containerReader = (api: RedstoneApi, x: number, y: number, z: number) => containerSignal(api.containerSlots(x, y, z));
registerRedstone(
  [CHEST, CHEST + 1, CHEST + 2, CHEST + 3, FURNACE, FURNACE + 1, FURNACE + 2, FURNACE + 3, FURNACE_LIT, FURNACE_LIT + 1,
    FURNACE_LIT + 2, FURNACE_LIT + 3, CHEST_DOUBLE, SMOKER, BLAST_FURNACE, BARREL, TRAPPED_CHEST, TRAPPED_CHEST_DOUBLE, BREWING_STAND],
  { analog: containerReader },
);
registerRedstone([CAULDRON, WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON], {
  analog: (_api, _x, _y, _z, id) => cauldronFill(id)?.level ?? 0,
});
registerRedstone(COMPOSTER, { analog: (_api, _x, _y, _z, id) => Math.max(0, composterLevel(id)) });
const JUKEBOXES: number[] = [];
for (let id = 1; id < BLOCK_COUNT; id++) if (defs[id] && familyBase(id) === id && isJukebox(id)) JUKEBOXES.push(id);
registerRedstone(JUKEBOXES, {
  analog: (api, x, y, z) => {
    const d = api.jukeboxDisc(x, y, z);
    return d >= 0 ? (d % 15) + 1 : 0;
  },
});
registerRedstone([LECTERN, LECTERN_BOOK], {
  // El servidor no sabe por qué página va el libro: se lee como abierto por la primera.
  analog: (api, x, y, z) => {
    const book = api.lecternBook(x, y, z);
    if (!book) return 0;
    const pages = Array.isArray(book.data?.pages) ? book.data.pages.length : 1;
    return pages > 1 ? 1 : 15;
  },
});
registerRedstone(CAKE, {
  analog: (_api, _x, _y, _z, id) => (7 - (stateProps(id)?.bites ?? 0)) * 2,
});
const CANDLE_CAKES: number[] = [];
for (let id = 1; id < BLOCK_COUNT; id++) if (defs[id] && familyBase(id) === id && isCandleCake(id)) CANDLE_CAKES.push(id);
registerRedstone(CANDLE_CAKES, { analog: () => 14 });
const BEE_HOMES: number[] = [];
for (let id = 1; id < BLOCK_COUNT; id++) if (defs[id] && familyBase(id) === id && isBeeHome(id)) BEE_HOMES.push(id);
registerRedstone(BEE_HOMES, { analog: (_api, _x, _y, _z, id) => Math.max(0, honeyLevel(id)) });
registerRedstone(CHISELED_BOOKSHELF, {
  // El último hueco que se tocó (1..6); lo anota el aviso de cambio.
  analog: (api, x, y, z) => api.getData(x, y, z),
  changed: (api, x, y, z, old, id) => {
    if (!isChiseledShelf(old) || !isChiseledShelf(id)) return;
    const diff = (stateProps(old)!.books ^ stateProps(id)!.books) & 63;
    if (diff) api.setData(x, y, z, 32 - Math.clz32(diff & -diff));
  },
});

// ------------------------------------------------------------------ polvo

registerRedstone(REDSTONE_WIRE, {
  // Clic derecho en polvo suelto: cruz o punto (el punto no da potencia a los lados). Como en Java
  // (updatesOnShapeChange), avisa además a los bloques que conducen por los lados cuya unión cambia.
  use: (api, x, y, z, id) => {
    const next = redstoneUseState(id, rel(api, x, y, z));
    if (next === null) return false;
    const before = [0, 0, 0, 0], after = [0, 0, 0, 0];
    wireConnections(rel(api, x, y, z), wireDot(id), before);
    api.setBlock(x, y, z, next);
    wireConnections(rel(api, x, y, z), wireDot(next), after);
    for (let d = 0; d < 4; d++) {
      const f = HFACE[d];
      const nx = x + FACE_X[f], nz = z + FACE_Z[f];
      if (!before[d] !== !after[d] && isConductor(api.getBlock(nx, y, nz))) api.updateNeighbors(nx, y, nz, f ^ 1, REDSTONE_WIRE);
    }
    return true;
  },
});
