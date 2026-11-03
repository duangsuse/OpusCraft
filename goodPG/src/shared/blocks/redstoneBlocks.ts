// Fase 7 (redstone): bloques de redstone.
// - Polvo de redstone (lo coloca el objeto `redstone`): potencia 0..15 en el estado y un punto aislado
//   (`dot`); sus uniones con los vecinos se calculan con la regla de Minecraft (también en escalones) y
//   de ellas salen su forma y hacia dónde da potencia. El color cambia con la potencia (una textura por nivel).
// - Antorcha de redstone (de pie y de pared), palanca, botones (de piedra y de cada madera), placas de
//   presión (piedra, maderas, ligera de oro y pesada de hierro), repetidor, comparador, bloque de
//   redstone, lámpara, sensor de luz solar, bloque diana, gancho de cuerda y cuerda tendida, bloque
//   musical, cofre trampa, pararrayos y bombilla de cobre (en sus cuatro fases, con y sin cera), puerta
//   y trampilla de hierro y la mena de redstone encendida.
// Aquí también se registra lo que emite cada uno (es puro y lo usan el servidor y la forma del polvo en
// el cliente); lo que hacen al cambiar la potencia está en shared/redstone/components.ts.
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import {
  family, defs, L, familyBase, stateOf, stateProps, isSlab, isStairs, isTrapdoor, FAMILY_KINDS, KINDS, BLOCK_COLLIDE,
  R_CUBE, R_MODEL, R_TORCH, type NeighborGet, type Opts, type BlockDef, type SoundMaterial,
} from './registry';
import { REDSTONE_ORE, CHEST, GLOWSTONE } from './classic';
import { WOODS, isFence } from './building';
import { WALLS, isWall } from './decoration';
import { DEEPSLATE_ORE, SURFACE_ORE } from './underground';
import { addCopperVariants, copperTexture } from './copperBlocks';
import { EXTRA_CHESTS } from './queries';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z, DIR_FACE, type ModelBox } from '../blockModels';
import { registerRedstone, setConductor, emitterOf, isConductor, HFACE, UP, DOWN, type RedstoneView, type Emitter } from '../redstone/api';

// ------------------------------------------------------------------ utilidades

const N = -1;
/** Caja plana (sólo la cara de arriba) a 1/16 del suelo. */
const flat = (x0: number, z0: number, x1: number, z1: number, t: number) => mbox(x0, 0, z0, x1, 1, z1, [N, N, t, N, N, N]);

/** Apoyo de palancas, botones y ganchos: 0 suelo, 1 pared, 2 techo. */
export const MOUNT_FLOOR = 0, MOUNT_WALL = 1, MOUNT_CEILING = 2;

/**
 * Coloca un modelo pensado sobre el suelo (apoyado en y = 0, con su eje a lo largo de Z) en la pared
 * (apoyado en z = 16, sobresaliendo hacia el norte) o en el techo, y lo gira hacia `facing`.
 */
function mounted(boxes: ModelBox[], mount: number, facing: number): ModelBox[] {
  let out = boxes;
  if (mount === MOUNT_WALL) {
    out = out.map((b) => ({
      x0: b.x0, x1: b.x1, y0: 16 - b.z1, y1: 16 - b.z0, z0: 16 - b.y1, z1: 16 - b.y0,
      tex: [b.tex[0], b.tex[1], b.tex[5], b.tex[4], b.tex[3], b.tex[2]],
    }));
  } else if (mount === MOUNT_CEILING) {
    out = out.map((b) => ({
      x0: b.x0, x1: b.x1, y0: 16 - b.y1, y1: 16 - b.y0, z0: 16 - b.z1, z1: 16 - b.z0,
      tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[5], b.tex[4]],
    }));
  }
  return rotateBoxes(out, facing);
}

/** Cara (dirección del bloque hacia su apoyo) de algo montado en el suelo, la pared o el techo. */
export function mountFace(mount: number, facing: number): number {
  return mount === MOUNT_FLOOR ? DOWN : mount === MOUNT_CEILING ? UP : HFACE[(facing + 2) & 3];
}

/** Lo que hay en la cara `face` de la celda (relativo). */
function atFace(get: NeighborGet, face: number): number {
  return face === DOWN ? get(0, -1, 0) : face === UP ? get(0, 1, 0) : get(FX[face], 0, FZ[face]);
}
const FX = [1, -1, 0, 0, 0, 0], FZ = [0, 0, 0, 0, 1, -1];

/** ¿Tiene el bloque una cara completa y firme? (cubos sólidos: piedra, cristal, hojas…). */
export function sturdy(id: number): boolean {
  return id > 0 && BLOCK_COLLIDE[id] === 1;
}

/** ¿Se puede apoyar encima polvo, un repetidor o una placa? (cubo sólido, losa de arriba o doble, escaleras invertidas). */
export function sturdyTop(id: number): boolean {
  if (id <= 0) return false;
  if (BLOCK_COLLIDE[id] === 1) return true;
  if (isSlab(id)) return stateProps(id)!.type !== 0;
  if (isStairs(id)) return stateProps(id)!.half === 1;
  return false;
}

/** Soporte en la cara `face` (vale también sin cargar). */
const supportAt = (get: NeighborGet, face: number) => {
  const b = atFace(get, face);
  return b < 0 || sturdy(b);
};
const topSupport = (get: NeighborGet) => {
  const b = get(0, -1, 0);
  return b < 0 || sturdyTop(b);
};

// ------------------------------------------------------------------ polvo de redstone

/** Uniones del polvo por lado (0 N, 1 E, 2 S, 3 O). */
export const WIRE_NONE = 0, WIRE_SIDE = 1, WIRE_UP = 2;

export const REDSTONE_WIRE = family('redstone_wire', 'Polvo de redstone', [['power', 16], ['dot', 2]], (st) => {
  const t = L(`redstone_dust_${st.power}`);
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'stone', all: `redstone_dust_${st.power}`,
    walkThrough: true, noItem: true, category: null, collision: [], selection: [0, 0, 0, 1, 1 / 16, 1],
    shape: (get: NeighborGet) => wireShape(get, st.dot === 1, t), support: topSupport,
  };
});

export function isWire(id: number): boolean {
  return id >= REDSTONE_WIRE && id < REDSTONE_WIRE + 32;
}
/** Potencia (0..15) de un polvo. */
export function wirePower(id: number): number {
  return (id - REDSTONE_WIRE) & 15;
}
/** ¿Es un punto aislado (y no una cruz)? */
export function wireDot(id: number): boolean {
  return id - REDSTONE_WIRE >= 16;
}
export function wireState(power: number, dot: boolean): number {
  return REDSTONE_WIRE + (power & 15) + (dot ? 16 : 0);
}

/** ¿Se une el polvo al bloque `id` que tiene en la dirección `dir`? (shouldConnectTo de Minecraft). */
function dustConnectsTo(id: number, dir: number): boolean {
  if (id <= 0) return false;
  if (isWire(id)) return true;
  const e = emitterOf(id);
  if (!e) return false;
  return e.connects ? e.connects(id, HFACE[(dir + 2) & 3]) : true;
}

/** Unión del polvo hacia `dir` (getConnectingSide de Minecraft). */
function wireSide(get: NeighborGet, dir: number, canUp: boolean): number {
  const dx = DIR_X[dir], dz = DIR_Z[dir];
  const n = get(dx, 0, dz);
  if (canUp && isWire(get(dx, 1, dz)) && (sturdyTop(n) || isTrapdoor(n))) return sturdy(n) ? WIRE_UP : WIRE_SIDE;
  if (dustConnectsTo(n, dir)) return WIRE_SIDE;
  if (!isConductor(n) && isWire(get(dx, -1, dz))) return WIRE_SIDE;
  return WIRE_NONE;
}

/**
 * Uniones del polvo con sus vecinos (`out`: 0 N, 1 E, 2 S, 3 O). Sin ninguna unión es una cruz (o un
 * punto si lo es); con uniones sólo en un eje se alarga en línea hasta los dos bordes (como en Minecraft).
 * Devuelve cuántas uniones reales tiene (antes de alargarse).
 */
export function wireConnections(get: NeighborGet, dot: boolean, out: number[]): number {
  const canUp = !isConductor(get(0, 1, 0));
  let real = 0;
  for (let d = 0; d < 4; d++) {
    out[d] = wireSide(get, d, canUp);
    if (out[d]) real++;
  }
  if (real === 0 && dot) return 0;
  const ns = !out[0] && !out[2], ew = !out[1] && !out[3];
  if (ns) {
    if (!out[3]) out[3] = WIRE_SIDE;
    if (!out[1]) out[1] = WIRE_SIDE;
  }
  if (ew) {
    if (!out[0]) out[0] = WIRE_SIDE;
    if (!out[2]) out[2] = WIRE_SIDE;
  }
  return real;
}

const tmpConn = [0, 0, 0, 0];
const emitConn = [0, 0, 0, 0];

/** Forma del polvo: mancha central, brazos hacia sus uniones y tiras que suben por las paredes. */
function wireShape(get: NeighborGet, dot: boolean, t: number): ModelBox[] {
  const c = tmpConn;
  wireConnections(get, dot, c);
  const blob = () => [flat(5, 5, 11, 11, t), flat(5, 4, 11, 5, t), flat(5, 11, 11, 12, t), flat(4, 5, 5, 11, t), flat(11, 5, 12, 11, t)];
  if (!c[0] && !c[1] && !c[2] && !c[3]) return blob();
  const out: ModelBox[] = [];
  if (c[0] && c[2] && !c[1] && !c[3]) out.push(flat(5, 0, 11, 16, t));
  else if (c[1] && c[3] && !c[0] && !c[2]) out.push(flat(0, 5, 16, 11, t));
  else {
    out.push(...blob());
    if (c[0]) out.push(flat(5, 0, 11, 4, t));
    if (c[1]) out.push(flat(12, 5, 16, 11, t));
    if (c[2]) out.push(flat(5, 12, 11, 16, t));
    if (c[3]) out.push(flat(0, 5, 4, 11, t));
  }
  // Subiendo por la pared del vecino (a 1/16 de ella).
  if (c[0] === WIRE_UP) out.push(mbox(5, 0, 0, 11, 16, 1, [N, N, N, N, t, N]));
  if (c[1] === WIRE_UP) out.push(mbox(15, 0, 5, 16, 16, 11, [N, t, N, N, N, N]));
  if (c[2] === WIRE_UP) out.push(mbox(5, 0, 15, 11, 16, 16, [N, N, N, N, N, t]));
  if (c[3] === WIRE_UP) out.push(mbox(0, 0, 5, 1, 16, 11, [t, N, N, N, N, N]));
  return out;
}

/** Vecino relativo a partir de la vista del motor. */
function relGet(v: RedstoneView, x: number, y: number, z: number): NeighborGet {
  return (dx, dy, dz) => v.getBlock(x + dx, y + dy, z + dz);
}

registerRedstone(REDSTONE_WIRE, {
  emitter: {
    // Hacia abajo y hacia los lados a los que se une (no hacia arriba).
    weak: (v, x, y, z, id, face) => {
      const p = wirePower(id);
      if (p === 0 || face === UP) return 0;
      if (face === DOWN) return p;
      wireConnections(relGet(v, x, y, z), wireDot(id), emitConn);
      return emitConn[HFACE.indexOf(face)] ? p : 0;
    },
    // La «potencia débil» de Minecraft: carga el bloque como fuerte, salvo para otro polvo (lo trata el motor).
    strong: (v, x, y, z, id, face) => {
      const e = emitterOf(id)!;
      return e.weak(v, x, y, z, id, face);
    },
  },
});

// ------------------------------------------------------------------ antorchas de redstone

export const REDSTONE_TORCH = family('redstone_torch', 'Antorcha de redstone', [['off', 2]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: st.off ? 0 : 7, sound: 'wood', hardness: 0, category: 'redstone',
  all: st.off ? 'redstone_torch_off' : 'redstone_torch', walkThrough: true,
}));
export const REDSTONE_WALL_TORCH = family('redstone_wall_torch', 'Antorcha de redstone', [['facing', 4], ['off', 2]], (st) => ({
  render: R_TORCH, solid: false, lightOpacity: 0, emission: st.off ? 0 : 7, sound: 'wood', hardness: 0, category: null,
  all: st.off ? 'redstone_torch_off' : 'redstone_torch', wall: st.facing, base: REDSTONE_TORCH, walkThrough: true,
  selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing),
}));

export function isRedstoneTorch(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === REDSTONE_TORCH || b === REDSTONE_WALL_TORCH);
}
export function torchLit(id: number): boolean {
  return id === REDSTONE_TORCH || (id >= REDSTONE_WALL_TORCH && id < REDSTONE_WALL_TORCH + 4);
}
/** La misma antorcha encendida o apagada. */
export function torchWithLit(id: number, lit: boolean): number {
  if (familyBase(id) === REDSTONE_TORCH) return lit ? REDSTONE_TORCH : REDSTONE_TORCH + 1;
  return REDSTONE_WALL_TORCH + ((id - REDSTONE_WALL_TORCH) & 3) + (lit ? 0 : 4);
}
/** Cara hacia el bloque en el que se apoya la antorcha. */
export function torchAttachFace(id: number): number {
  return familyBase(id) === REDSTONE_TORCH ? DOWN : HFACE[(((id - REDSTONE_WALL_TORCH) & 3) + 2) & 3];
}

registerRedstone([REDSTONE_TORCH, REDSTONE_WALL_TORCH], {
  emitter: {
    weak: (_v, _x, _y, _z, id, face) => (torchLit(id) && face !== torchAttachFace(id) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (torchLit(id) && face === UP ? 15 : 0),
  },
});

// ------------------------------------------------------------------ palanca y botones

/** Estados de lo que va montado (palanca, botones): mount (3) × facing (4) × powered (2). */
const MOUNTED_PROPS: [string, number][] = [['mount', 3], ['facing', 4], ['powered', 2]];

export function mountOf(id: number): number {
  return (id - familyBase(id)) % 3;
}
export function mountFacing(id: number): number {
  return Math.floor((id - familyBase(id)) / 3) & 3;
}
export function mountedPowered(id: number): boolean {
  return id - familyBase(id) >= 12;
}
export function mountedWithPowered(id: number, on: boolean): number {
  const i = (id - familyBase(id)) % 12;
  return familyBase(id) + i + (on ? 12 : 0);
}
/** Cara hacia el apoyo de una palanca o un botón. */
export function mountedAttachFace(id: number): number {
  return mountFace(mountOf(id), mountFacing(id));
}

function mountedSupport(mount: number, facing: number) {
  const face = mountFace(mount, facing);
  return (get: NeighborGet) => supportAt(get, face);
}

export const LEVER = family('lever', 'Palanca', MOUNTED_PROPS, (st) => {
  const base = L('cobblestone'), h = L('lever_handle');
  // Mango escalonado (inclinado hacia el norte apagada, hacia el sur encendida).
  const steps = st.powered ? [[7, 9], [8, 10], [9, 11], [10, 12]] : [[7, 9], [6, 8], [5, 7], [4, 6]];
  const boxes = [mbox(5, 0, 4, 11, 3, 12, base), ...steps.map(([z0, z1], k) => mbox(7, 3 + k * 2, z0, 9, 5 + k * 2, z1, h))];
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0.5, sound: 'wood', all: 'cobblestone',
    category: 'redstone', walkThrough: true, collision: [], model: mounted(boxes, st.mount, st.facing),
    itemModel: mounted(boxes, MOUNT_WALL, 0), support: mountedSupport(st.mount, st.facing),
  };
});

/** Botones: de piedra y de cada madera (el de madera dura más y lo pulsan las flechas). */
export const BUTTONS: Record<string, number> = {};
const WOODEN_BUTTONS = new Set<number>();

function button(key: string, name: string, tex: string, sound: SoundMaterial): number {
  return family(`${key}_button`, `Botón ${name}`, MOUNTED_PROPS, (st) => {
    const t = L(tex);
    const box = [mbox(5, 0, 6, 11, st.powered ? 1 : 2, 10, t)];
    return {
      render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0.5, sound, all: tex, category: 'redstone',
      walkThrough: true, collision: [], model: mounted(box, st.mount, st.facing), itemModel: [mbox(5, 6, 6, 11, 10, 10, t)],
      support: mountedSupport(st.mount, st.facing),
    };
  });
}
const BUTTON_BASES = new Set<number>();
/**
 * Botón nuevo (los materiales que se registran después: fase 8.2). `wooden`: dura 30 ticks y lo pulsan las
 * flechas (los de madera); si no, 20 (los de piedra).
 */
export function addButton(key: string, name: string, tex: string, sound: SoundMaterial, wooden: boolean): number {
  const id = button(key, name, tex, sound);
  BUTTONS[key] = id;
  BUTTON_BASES.add(id);
  if (wooden) WOODEN_BUTTONS.add(id);
  registerRedstone(id, { emitter: mountedEmitter });
  return id;
}
BUTTONS.stone = button('stone', 'de piedra', 'stone', 'stone');
for (const w of WOODS) {
  BUTTONS[w.key] = button(w.key, w.name, defs[w.block].tex[0], 'wood');
  WOODEN_BUTTONS.add(BUTTONS[w.key]);
}
for (const id of Object.values(BUTTONS)) BUTTON_BASES.add(id);

export function isButton(id: number): boolean {
  return id > 0 && BUTTON_BASES.has(familyBase(id));
}
export function isWoodenButton(id: number): boolean {
  return id > 0 && WOODEN_BUTTONS.has(familyBase(id));
}
export function isLever(id: number): boolean {
  return id > 0 && familyBase(id) === LEVER;
}

const mountedEmitter = {
  weak: (_v: RedstoneView, _x: number, _y: number, _z: number, id: number) => (mountedPowered(id) ? 15 : 0),
  strong: (_v: RedstoneView, _x: number, _y: number, _z: number, id: number, face: number) =>
    mountedPowered(id) && face === mountedAttachFace(id) ? 15 : 0,
};
registerRedstone([LEVER, ...BUTTON_BASES], { emitter: mountedEmitter });

// ------------------------------------------------------------------ placas de presión

/** Placas de presión: de piedra y de cada madera (encendidas o no). */
export const PRESSURE_PLATES: Record<string, number> = {};
const WOODEN_PLATES = new Set<number>();

/** ¿Se puede poner una placa encima? (cara de arriba firme, vallas y muros). */
function plateSupport(get: NeighborGet): boolean {
  const b = get(0, -1, 0);
  return b < 0 || sturdyTop(b) || isFence(b) || isWall(familyBase(b));
}

function plateModel(t: number, pressed: boolean): ModelBox[] {
  // Suelta sobresale 2/16; pisada, 1/16 (el vértice del terreno va de 1/16 en 1/16).
  return [mbox(1, 0, 1, 15, pressed ? 1 : 2, 15, t)];
}

function plateOpts(tex: string, sound: SoundMaterial, pressed: boolean): Opts {
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0.5, sound, all: tex, category: 'redstone',
    walkThrough: true, collision: [], model: plateModel(L(tex), pressed), support: plateSupport,
  };
}

function plate(key: string, name: string, tex: string, sound: SoundMaterial): number {
  return family(`${key}_pressure_plate`, `Placa de presión ${name}`, [['powered', 2]], (st) => plateOpts(tex, sound, st.powered === 1));
}
PRESSURE_PLATES.stone = plate('stone', 'de piedra', 'stone', 'stone');
for (const w of WOODS) {
  PRESSURE_PLATES[w.key] = plate(w.key, w.name, defs[w.block].tex[0], 'wood');
  WOODEN_PLATES.add(PRESSURE_PLATES[w.key]);
}
const PLATE_BASES = new Set(Object.values(PRESSURE_PLATES));
/**
 * Placa nueva (fase 8.2). `wooden`: la pisa cualquier entidad (las de madera); si no, sólo los seres vivos
 * (las de piedra).
 */
export function addPressurePlate(key: string, name: string, tex: string, sound: SoundMaterial, wooden: boolean): number {
  const id = plate(key, name, tex, sound);
  PRESSURE_PLATES[key] = id;
  PLATE_BASES.add(id);
  if (wooden) WOODEN_PLATES.add(id);
  registerRedstone(id, { emitter: plateEmitter });
  return id;
}

/** Placas de peso: ligera (de oro: una potencia por entidad) y pesada (de hierro: una por cada diez). */
export const LIGHT_WEIGHTED_PLATE = family('light_weighted_pressure_plate', 'Placa de presión para peso ligero', [['power', 16]], (st) =>
  ({ ...plateOpts('gold_block', 'metal', st.power > 0), tool: 'pickaxe' }));
export const HEAVY_WEIGHTED_PLATE = family('heavy_weighted_pressure_plate', 'Placa de presión para peso pesado', [['power', 16]], (st) =>
  ({ ...plateOpts('iron_block', 'metal', st.power > 0), tool: 'pickaxe' }));

export function isPressurePlate(id: number): boolean {
  return id > 0 && PLATE_BASES.has(familyBase(id));
}
export function isWoodenPlate(id: number): boolean {
  return id > 0 && WOODEN_PLATES.has(familyBase(id));
}
export function isWeightedPlate(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === LIGHT_WEIGHTED_PLATE || b === HEAVY_WEIGHTED_PLATE);
}
/** Potencia que da una placa (0..15). */
export function platePower(id: number): number {
  if (isPressurePlate(id)) return id - familyBase(id) ? 15 : 0;
  if (isWeightedPlate(id)) return id - familyBase(id);
  return 0;
}

const plateEmitter: Emitter = {
  weak: (_v, _x, _y, _z, id) => platePower(id),
  strong: (_v, _x, _y, _z, id, face) => (face === DOWN ? platePower(id) : 0),
};
registerRedstone([...PLATE_BASES, LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE], { emitter: plateEmitter });

// ------------------------------------------------------------------ repetidor y comparador

/** Brazos de la antorcha de un repetidor o un comparador (2×2 y del alto dado). */
function torchBit(x: number, z: number, h: number, on: boolean): ModelBox {
  const s = L(on ? 'redstone_torch_side_on' : 'redstone_torch_side_off'), t = L(on ? 'redstone_torch_top_on' : 'redstone_torch_top_off');
  return mbox(x, 2, z, x + 2, 2 + h, z + 2, [s, s, t, N, s, s]);
}

function diodeBase(top: string): ModelBox {
  const side = L('smooth_stone_slab_side');
  return mbox(0, 0, 0, 16, 2, 16, [side, side, L(top), L('smooth_stone'), side, side]);
}

/**
 * Repetidor: `facing` es hacia donde sale la señal (0 N, 1 E, 2 S, 3 O), `delay` 0..3 (1..4 ticks de
 * redstone), `powered` y `locked` (bloqueado por un repetidor o un comparador de lado).
 */
export const REPEATER = family('repeater', 'Repetidor de redstone', [['facing', 4], ['delay', 4], ['powered', 2], ['locked', 2]], (st) => {
  const on = st.powered === 1;
  const z = 6 + st.delay * 2;
  const boxes = [diodeBase(`repeater_${on ? 'on' : 'off'}_${st.facing}`), torchBit(7, 2, 5, on)];
  if (st.locked) boxes.push(mbox(2, 2, z, 14, 4, z + 2, L('bedrock')));
  else boxes.push(torchBit(7, z, 5, on));
  // El modelo se piensa mirando al norte: la textura de arriba ya va girada, sólo se giran las cajas.
  const model = rotateBoxes(boxes.slice(1), st.facing);
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0, sound: 'stone', all: 'smooth_stone', category: 'redstone',
    model: [boxes[0], ...model], collision: [0, 0, 0, 1, 2 / 16, 1], selection: [0, 0, 0, 1, 2 / 16, 1], support: topSupport,
  };
});

export function isRepeater(id: number): boolean {
  return id >= REPEATER && id < REPEATER + 64;
}
/** Dirección de salida (0..3) de un repetidor o un comparador. */
export function diodeFacing(id: number): number {
  return (id - familyBase(id)) & 3;
}
export function repeaterDelay(id: number): number {
  return ((id - REPEATER) >> 2) & 3;
}
export function diodePowered(id: number): boolean {
  return isRepeater(id) ? ((id - REPEATER) & 16) !== 0 : isComparator(id) ? ((id - COMPARATOR) & 8) !== 0 : false;
}
export function repeaterLocked(id: number): boolean {
  return ((id - REPEATER) & 32) !== 0;
}
export function repeaterWith(id: number, powered: boolean, locked: boolean): number {
  return REPEATER + ((id - REPEATER) & 15) + (powered ? 16 : 0) + (locked ? 32 : 0);
}

/** Comparador: `facing` como el repetidor, `subtract` (antorcha de delante encendida) y `powered`. */
export const COMPARATOR = family('comparator', 'Comparador de redstone', [['facing', 4], ['subtract', 2], ['powered', 2]], (st) => {
  const on = st.powered === 1;
  const boxes = [
    diodeBase(`comparator_${on ? 'on' : 'off'}_${st.facing}`),
    torchBit(4, 11, 5, on), torchBit(10, 11, 5, on), torchBit(7, 2, st.subtract ? 4 : 3, st.subtract === 1),
  ];
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0, sound: 'stone', all: 'smooth_stone', category: 'redstone',
    model: [boxes[0], ...rotateBoxes(boxes.slice(1), st.facing)], collision: [0, 0, 0, 1, 2 / 16, 1],
    selection: [0, 0, 0, 1, 2 / 16, 1], support: topSupport,
  };
});

export function isComparator(id: number): boolean {
  return id >= COMPARATOR && id < COMPARATOR + 16;
}
export function comparatorSubtract(id: number): boolean {
  return ((id - COMPARATOR) & 4) !== 0;
}
export function comparatorWith(id: number, powered: boolean): number {
  return COMPARATOR + ((id - COMPARATOR) & 7) + (powered ? 8 : 0);
}
export function isDiode(id: number): boolean {
  return isRepeater(id) || isComparator(id);
}

/** Cara de salida de un repetidor o un comparador. */
export function diodeOutFace(id: number): number {
  return HFACE[diodeFacing(id)];
}

registerRedstone(REPEATER, {
  emitter: {
    weak: (_v, _x, _y, _z, id, face) => (diodePowered(id) && face === diodeOutFace(id) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (diodePowered(id) && face === diodeOutFace(id) ? 15 : 0),
    // El polvo sólo se une por delante y por detrás.
    connects: (id, face) => face === diodeOutFace(id) || face === (diodeOutFace(id) ^ 1),
  },
});
registerRedstone(COMPARATOR, {
  emitter: {
    weak: (v, x, y, z, id, face) => (diodePowered(id) && face === diodeOutFace(id) ? v.getData(x, y, z) : 0),
    strong: (v, x, y, z, id, face) => (diodePowered(id) && face === diodeOutFace(id) ? v.getData(x, y, z) : 0),
  },
});

// ------------------------------------------------------------------ bloque de redstone, lámpara, sensor, diana y bloque musical

export const REDSTONE_BLOCK = family('redstone_block', 'Bloque de redstone', [], () => ({
  all: 'redstone_block', hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'redstone',
}));
registerRedstone(REDSTONE_BLOCK, { emitter: { weak: () => 15 } });

export const REDSTONE_LAMP = family('redstone_lamp', 'Lámpara de redstone', [['lit', 2]], (st) => ({
  all: st.lit ? 'redstone_lamp_on' : 'redstone_lamp', hardness: 0.3, sound: 'glass', emission: st.lit ? 15 : 0, category: 'redstone',
}));
export function isLamp(id: number): boolean {
  return id === REDSTONE_LAMP || id === REDSTONE_LAMP + 1;
}

/** Sensor de luz solar: potencia 0..15 según el sol; invertido, según la oscuridad. */
export const DAYLIGHT_DETECTOR = family('daylight_detector', 'Sensor de luz solar', [['power', 16], ['inverted', 2]], (st) => {
  const side = L('daylight_detector_side');
  const top = L(st.inverted ? 'daylight_detector_inverted_top' : 'daylight_detector_top');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.2, sound: 'wood', all: 'daylight_detector_side', category: 'redstone',
    model: [mbox(0, 0, 0, 16, 6, 16, [side, side, top, L('oak_planks'), side, side])],
    collision: [0, 0, 0, 1, 6 / 16, 1],
  };
});
export function isDaylightDetector(id: number): boolean {
  return id >= DAYLIGHT_DETECTOR && id < DAYLIGHT_DETECTOR + 32;
}
export function daylightInverted(id: number): boolean {
  return id - DAYLIGHT_DETECTOR >= 16;
}
export function daylightWith(id: number, power: number, inverted: boolean): number {
  void id;
  return DAYLIGHT_DETECTOR + (power & 15) + (inverted ? 16 : 0);
}

/** Bloque diana: da potencia un rato cuando le da un proyectil (más cuanto más al centro). */
export const TARGET = family('target', 'Diana', [['power', 16]], () => ({
  tex: ['target_side', 'target_side', 'target_top', 'target_top', 'target_side', 'target_side'], hardness: 0.5, sound: 'grass',
  category: 'redstone',
}));
export function isTarget(id: number): boolean {
  return id >= TARGET && id < TARGET + 16;
}

/** Bloque musical: tono 0..24 y encendido (suena al recibir potencia). */
export const NOTE_BLOCK = family('note_block', 'Bloque musical', [['note', 25], ['powered', 2]], () => ({
  all: 'note_block', hardness: 0.8, tool: 'axe', sound: 'wood', category: 'redstone',
}));
export function isNoteBlock(id: number): boolean {
  return id >= NOTE_BLOCK && id < NOTE_BLOCK + 50;
}
export function noteOf(id: number): number {
  return (id - NOTE_BLOCK) % 25;
}
export function noteBlockWith(note: number, powered: boolean): number {
  return NOTE_BLOCK + (((note % 25) + 25) % 25) + (powered ? 25 : 0);
}

const levelEmitter = (base: number) => ({ weak: (_v: RedstoneView, _x: number, _y: number, _z: number, id: number) => (id - base) & 15 });
registerRedstone(DAYLIGHT_DETECTOR, { emitter: levelEmitter(DAYLIGHT_DETECTOR) });
registerRedstone(TARGET, { emitter: levelEmitter(TARGET) });

// ------------------------------------------------------------------ gancho de cuerda y cuerda tendida

/** Gancho: en una pared, `facing` hacia fuera; `attached` con cuerda tendida hasta otro gancho, `powered` al pisarla. */
export const TRIPWIRE_HOOK = family('tripwire_hook', 'Gancho de cuerda', [['facing', 4], ['attached', 2], ['powered', 2]], (st) => {
  const wood = L('oak_planks'), iron = L('iron_block');
  const y = st.attached ? -2 : 0;
  const boxes = [
    mbox(6, 1, 14, 10, 10, 16, wood),
    // Palito y anilla (baja un poco con la cuerda tendida).
    mbox(7, 6 + y, 10, 9, 7 + y, 14, iron),
    mbox(6, 4 + y, 8, 7, 9 + y, 10, iron), mbox(9, 4 + y, 8, 10, 9 + y, 10, iron),
    mbox(7, 8 + y, 8, 9, 9 + y, 10, iron), mbox(7, 4 + y, 8, 9, 5 + y, 10, iron),
  ];
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'wood', all: 'oak_planks', category: 'redstone',
    walkThrough: true, collision: [], model: rotateBoxes(boxes, st.facing), selection: rotateFlat([5 / 16, 0, 10 / 16, 11 / 16, 10 / 16, 1], st.facing),
    support: (get: NeighborGet) => supportAt(get, HFACE[(st.facing + 2) & 3]),
  };
});
export function isTripwireHook(id: number): boolean {
  return id >= TRIPWIRE_HOOK && id < TRIPWIRE_HOOK + 16;
}
export function hookFacing(id: number): number {
  return (id - TRIPWIRE_HOOK) & 3;
}
export function hookAttached(id: number): boolean {
  return ((id - TRIPWIRE_HOOK) & 4) !== 0;
}
export function hookPowered(id: number): boolean {
  return ((id - TRIPWIRE_HOOK) & 8) !== 0;
}
export function hookWith(id: number, attached: boolean, powered: boolean): number {
  return TRIPWIRE_HOOK + hookFacing(id) + (attached ? 4 : 0) + (powered ? 8 : 0);
}

/** Cuerda tendida (la coloca la cuerda): `powered` si hay algo encima, `attached` entre dos ganchos, `disarmed` cortada con tijeras. */
export const TRIPWIRE = family('tripwire', 'Cuerda', [['powered', 2], ['attached', 2], ['disarmed', 2]], (st) => {
  const t = L('tripwire');
  const y = st.attached ? 1 : 2;
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'wool', all: 'tripwire', noItem: true,
    category: null, walkThrough: true, collision: [], selection: [0, 0, 0, 1, 2 / 16, 1],
    shape: (get: NeighborGet) => {
      const c = [0, 1, 2, 3].map((d) => tripwireConnects(get(DIR_X[d], 0, DIR_Z[d]), d));
      const line = (d: number) => {
        // Brazo desde el centro hasta el borde de la dirección d (1/16 de ancho).
        if (d === 0) return mbox(7, y, 0, 8, y, 8, [N, N, t, t, N, N]);
        if (d === 2) return mbox(7, y, 8, 8, y, 16, [N, N, t, t, N, N]);
        if (d === 1) return mbox(8, y, 7, 16, y, 8, [N, N, t, t, N, N]);
        return mbox(0, y, 7, 8, y, 8, [N, N, t, t, N, N]);
      };
      // Sin uniones, o sólo en un eje, se tiende de lado a lado.
      if (!c[1] && !c[3]) return [line(0), line(2)];
      if (!c[0] && !c[2]) return [line(1), line(3)];
      return [0, 1, 2, 3].filter((d) => c[d]).map(line);
    },
  };
});
export function isTripwire(id: number): boolean {
  return id >= TRIPWIRE && id < TRIPWIRE + 8;
}
/** ¿Se une la cuerda al bloque que tiene en la dirección `dir`? (otra cuerda o un gancho que la mira). */
export function tripwireConnects(id: number, dir: number): boolean {
  return isTripwire(id) || (isTripwireHook(id) && hookFacing(id) === ((dir + 2) & 3));
}
export function tripwirePowered(id: number): boolean {
  return ((id - TRIPWIRE) & 1) !== 0;
}
export function tripwireAttached(id: number): boolean {
  return ((id - TRIPWIRE) & 2) !== 0;
}
export function tripwireDisarmed(id: number): boolean {
  return ((id - TRIPWIRE) & 4) !== 0;
}
export function tripwireWith(powered: boolean, attached: boolean, disarmed: boolean): number {
  return TRIPWIRE + (powered ? 1 : 0) + (attached ? 2 : 0) + (disarmed ? 4 : 0);
}

registerRedstone(TRIPWIRE_HOOK, {
  emitter: {
    weak: (_v, _x, _y, _z, id) => (hookPowered(id) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (hookPowered(id) && face === HFACE[(hookFacing(id) + 2) & 3] ? 15 : 0),
  },
});

// ------------------------------------------------------------------ cofre trampa

/** Cofre trampa: como el cofre (y se une en dobles con otro cofre trampa); da potencia mientras está abierto. */
export const TRAPPED_CHEST = family('trapped_chest', 'Cofre trampa', [['facing', 4]], (st) => {
  const tex: BlockDef['tex'] = ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_side', 'chest_side'];
  tex[DIR_FACE[st.facing]] = 'trapped_chest_front';
  return { tex, hardness: 2.5, tool: 'axe', sound: 'wood', category: 'redstone' };
});
export const TRAPPED_CHEST_DOUBLE = family('trapped_chest_double', 'Cofre trampa', [['facing', 4], ['side', 2]], (st) => {
  const tex: BlockDef['tex'] = ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_side', 'chest_side'];
  tex[DIR_FACE[st.facing]] = st.side === 0 ? 'trapped_chest_front_seam_right' : 'trapped_chest_front_seam_left';
  tex[DIR_FACE[(st.facing + 2) & 3]] = st.side === 0 ? 'chest_side_seam_left' : 'chest_side_seam_right';
  return { tex, hardness: 2.5, tool: 'axe', sound: 'wood', category: null, base: TRAPPED_CHEST };
});
// Es un cofre más (se abre, guarda cosas y se une en dobles): lo tratan las consultas de cofres.
EXTRA_CHESTS.push({ single: TRAPPED_CHEST, double: TRAPPED_CHEST_DOUBLE });
export function isTrappedChest(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === TRAPPED_CHEST || b === TRAPPED_CHEST_DOUBLE);
}
/** ¿Mitad de un cofre doble (normal o trampa)? */
export function isDoubleChestHalf(id: number, doubleBase: number): boolean {
  return id > 0 && familyBase(id) === doubleBase;
}

registerRedstone([TRAPPED_CHEST, TRAPPED_CHEST_DOUBLE], {
  emitter: {
    // Cuántos lo tienen abierto (lo lleva el motor en su dato de posición).
    weak: (v, x, y, z) => Math.min(15, v.getData(x, y, z)),
    strong: (v, x, y, z, _id, face) => (face === DOWN ? Math.min(15, v.getData(x, y, z)) : 0),
  },
});

// ------------------------------------------------------------------ puerta y trampilla de hierro

/** Puerta de hierro: como las de madera, pero sólo la abre la redstone. */
export const IRON_DOOR = family('iron_door', 'Puerta de hierro', [['facing', 4], ['half', 2], ['open', 2], ['hinge', 2]], (st) => {
  const tx = L(st.half ? 'iron_door_top' : 'iron_door_bottom');
  const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
  return {
    hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', render: R_MODEL, model: rotateBoxes([panel], st.facing), all: 'iron_door_bottom',
    walkThrough: st.open === 1, category: 'redstone',
  };
});
/** Trampilla de hierro: sólo la abre la redstone. */
export const IRON_TRAPDOOR = family('iron_trapdoor', 'Trampilla de hierro', [['facing', 4], ['half', 2], ['open', 2]], (st) => {
  const tx = L('iron_trapdoor');
  const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing)
    : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
  return { hardness: 5, tool: 'pickaxe', tier: 1, sound: 'metal', render: R_MODEL, model: box, all: 'iron_trapdoor', category: 'redstone' };
});
FAMILY_KINDS.set(IRON_DOOR, KINDS.door);
FAMILY_KINDS.set(IRON_TRAPDOOR, KINDS.trapdoor);

/** ¿Sólo se abre con redstone? (puerta y trampilla de hierro). */
export function isIronOpenable(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === IRON_DOOR || b === IRON_TRAPDOOR);
}

// ------------------------------------------------------------------ mena de redstone encendida

/** Mena de redstone encendida (al tocarla o pisarla): da luz y se apaga sola con los ticks aleatorios. */
export const LIT_REDSTONE_ORE = family('lit_redstone_ore', 'Mena de redstone', [], () => ({
  tex: defs[REDSTONE_ORE].tex, hardness: defs[REDSTONE_ORE].hardness, tool: 'pickaxe', tier: defs[REDSTONE_ORE].tier, sound: 'stone',
  emission: 9, category: null, base: REDSTONE_ORE,
}));
const DEEP_REDSTONE = DEEPSLATE_ORE[REDSTONE_ORE];
export const LIT_DEEPSLATE_REDSTONE_ORE = family('lit_deepslate_redstone_ore', 'Mena de redstone de pizarra profunda', [], () => ({
  tex: defs[DEEP_REDSTONE].tex, hardness: defs[DEEP_REDSTONE].hardness, tool: 'pickaxe', tier: defs[DEEP_REDSTONE].tier, sound: 'stone',
  emission: 9, category: null, base: DEEP_REDSTONE,
}));
// Las dos encendidas cuentan como la mena de redstone (su botín, Fortuna y la experiencia).
SURFACE_ORE[LIT_DEEPSLATE_REDSTONE_ORE] = REDSTONE_ORE;
SURFACE_ORE[LIT_REDSTONE_ORE] = REDSTONE_ORE;

/** La mena de redstone (normal o de pizarra) encendida o apagada; 0 si no es una mena de redstone. */
export function redstoneOreLit(id: number, lit: boolean): number {
  if (id === REDSTONE_ORE || id === LIT_REDSTONE_ORE) return lit ? LIT_REDSTONE_ORE : REDSTONE_ORE;
  if (id === DEEP_REDSTONE || id === LIT_DEEPSLATE_REDSTONE_ORE) return lit ? LIT_DEEPSLATE_REDSTONE_ORE : DEEP_REDSTONE;
  return 0;
}
export function isLitRedstoneOre(id: number): boolean {
  return id > 0 && (id === LIT_REDSTONE_ORE || id === LIT_DEEPSLATE_REDSTONE_ORE);
}

// ------------------------------------------------------------------ cobre: bombilla y pararrayos

/** Luz de la bombilla encendida en cada fase de oxidación. */
const BULB_LIGHT = [15, 12, 8, 4];

/** Bombilla de cobre: cambia de encendida a apagada con cada pulso de redstone (no se abre a mano). */
export const COPPER_BULB = addCopperVariants('bulb', 'copper_bulb', 'Bombilla de cobre', [['lit', 2], ['powered', 2]], (s) => (st) => ({
  all: copperTexture(st.lit ? 'copper_bulb_lit' : 'copper_bulb', s), hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal',
  category: 'redstone', emission: st.lit ? BULB_LIGHT[s] : 0,
}));
const BULB_BASES = new Set(COPPER_BULB.flat());
export function isCopperBulb(id: number): boolean {
  return id > 0 && BULB_BASES.has(familyBase(id));
}
export function bulbLit(id: number): boolean {
  return ((id - familyBase(id)) & 1) !== 0;
}
export function bulbPowered(id: number): boolean {
  return ((id - familyBase(id)) & 2) !== 0;
}
export function bulbWith(id: number, lit: boolean, powered: boolean): number {
  return familyBase(id) + (lit ? 1 : 0) + (powered ? 2 : 0);
}

/** Cajas del pararrayos apuntando hacia arriba (asta de 2×2 y punta de 4×4). */
function rodBoxes(t: number): ModelBox[] {
  return [mbox(7, 0, 7, 9, 12, 9, t), mbox(6, 12, 6, 10, 16, 10, t)];
}
/** Gira cajas pensadas hacia arriba para que apunten hacia la cara `face`. */
export function pointTo(boxes: ModelBox[], face: number): ModelBox[] {
  if (face === UP) return boxes;
  if (face === DOWN) return boxes.map((b) => ({ ...b, y0: 16 - b.y1, y1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[4], b.tex[5]] }));
  // Horizontal: tumbado hacia el norte y luego girado.
  const north = boxes.map((b) => ({
    x0: b.x0, x1: b.x1, y0: b.z0, y1: b.z1, z0: 16 - b.y1, z1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[4], b.tex[5], b.tex[3], b.tex[2]],
  }));
  return rotateBoxes(north, HFACE.indexOf(face));
}
const ROD_SEL: number[][] = [0, 1, 2, 3, 4, 5].map((f) => {
  const [b] = pointTo([mbox(6, 0, 6, 10, 16, 10, 0)], f);
  return [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
});

/** Pararrayos: `facing` es la cara hacia la que apunta (0..5); `powered` un momento cuando le cae un rayo. */
export const LIGHTNING_ROD = addCopperVariants('lightning_rod', 'lightning_rod', 'Pararrayos', [['facing', 6], ['powered', 2]], (s) => (st) => {
  const tex = st.powered ? 'lightning_rod_on' : copperTexture('lightning_rod', s);
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, all: tex, hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'redstone',
    model: pointTo(rodBoxes(L(tex)), st.facing), itemModel: rodBoxes(L(copperTexture('lightning_rod', s))),
    collision: ROD_SEL[st.facing], selection: ROD_SEL[st.facing],
  };
});
const ROD_BASES = new Set(LIGHTNING_ROD.flat());
export function isLightningRod(id: number): boolean {
  return id > 0 && ROD_BASES.has(familyBase(id));
}
export function rodFacing(id: number): number {
  return (id - familyBase(id)) % 6;
}
export function rodPowered(id: number): boolean {
  return id - familyBase(id) >= 6;
}
export function rodWith(id: number, powered: boolean): number {
  return familyBase(id) + rodFacing(id) + (powered ? 6 : 0);
}
/** Pararrayos de cobre normal sin cera apuntando hacia `face`. */
export function rodPointing(base: number, face: number): number {
  return familyBase(base) + face;
}

registerRedstone([...ROD_BASES], {
  emitter: {
    weak: (_v, _x, _y, _z, id) => (rodPowered(id) ? 15 : 0),
    // Fuerte hacia el bloque de su base (el contrario de hacia donde apunta).
    strong: (_v, _x, _y, _z, id, face) => (rodPowered(id) && face === (rodFacing(id) ^ 1) ? 15 : 0),
  },
});

// ------------------------------------------------------------------ conductores

// No conducen (como en Minecraft): la piedra luminosa, el bloque de redstone y los cofres.
setConductor([GLOWSTONE, REDSTONE_BLOCK, ...[0, 1, 2, 3].map((f) => CHEST + f)], false);
for (let i = 0; i < 4; i++) setConductor(TRAPPED_CHEST + i, false);
for (let i = 0; i < 8; i++) setConductor(TRAPPED_CHEST_DOUBLE + i, false);

// ------------------------------------------------------------------ inventario creativo

export const REDSTONE_INVENTORY: readonly number[] = [
  REDSTONE_TORCH, REDSTONE_BLOCK, REPEATER, COMPARATOR, LEVER, ...Object.values(BUTTONS), ...Object.values(PRESSURE_PLATES),
  LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE, REDSTONE_LAMP, DAYLIGHT_DETECTOR, TARGET, TRIPWIRE_HOOK, NOTE_BLOCK, TRAPPED_CHEST,
  IRON_DOOR, IRON_TRAPDOOR,
];
