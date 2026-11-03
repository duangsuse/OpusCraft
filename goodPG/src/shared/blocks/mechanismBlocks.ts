// Fase 7 (mecanismos): bloques que mueven, observan, reparten o explotan.
// - Pistón y pistón adhesivo (6 orientaciones, recogido o extendido), la cabeza del pistón con su brazo y el
//   bloque en movimiento (el hueco invisible que ocupa lo que empuja un pistón mientras se desliza).
// - Observador (6 orientaciones; la cara mira al bloque que vigila y el punto rojo de detrás se enciende).
// - Tolva (hacia abajo o a un lado; bloqueada con potencia), dispensador y soltador (6 orientaciones).
// - Dinamita.
// Aquí también se registra lo que emite el observador (lo usa la forma del polvo en el cliente); lo que
// hacen todos está en el servidor (sim/server/pistons.ts, hoppers.ts, dispensers.ts, tnt.ts).
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, familyBase, L, R_MODEL, R_NONE, type BlockDef, type Opts } from './registry';
import { mbox, rotateBoxes, autoUV, type ModelBox } from '../blockModels';
import { registerRedstone, setConductor, FACE_X, FACE_Y, FACE_Z, UP, DOWN, NORTH, SOUTH, EAST, WEST, HFACE } from '../redstone/api';

// ------------------------------------------------------------------ orientación

/** Caras en el orden de api.ts: 0 este, 1 oeste, 2 arriba, 3 abajo, 4 sur, 5 norte. */
export const FACING_COUNT = 6;

/**
 * Giro (cuartos de vuelta en el sentido de las agujas) que lleva el borde de arriba de una textura, dibujada
 * en la cara `f` de un bloque (con las UV de autoUV), hacia la dirección `dir` (una cara perpendicular).
 */
export function edgeTurn(f: number, dir: number): number {
  const [u0, v0] = autoUV(f, 8, 8, 8);
  const [u1, v1] = autoUV(f, 8 + FACE_X[dir], 8 + FACE_Y[dir], 8 + FACE_Z[dir]);
  const du = u1 - u0, dv = v1 - v0;
  return dv < 0 ? 0 : du > 0 ? 1 : dv > 0 ? 2 : 3;
}

/** Nombre de la textura `name` girada `turn` cuartos de vuelta (las giradas se generan aparte). */
export const turned = (name: string, turn: number): string => (turn & 3 ? `${name}_r${turn & 3}` : name);
/** Texturas que se generan también giradas (el cliente las dibuja con los cuatro giros). */
export const TURNED_TEXTURES: readonly string[] = ['piston_side', 'observer_top'];

/**
 * Coloca cajas pensadas apuntando hacia arriba (+Y) para que apunten hacia la cara `face`. Las caras de
 * cada caja se reordenan con ellas (la de arriba pasa a ser la de delante).
 */
export function pointBoxes(boxes: ModelBox[], face: number): ModelBox[] {
  if (face === UP) return boxes;
  if (face === DOWN) return boxes.map((b) => ({ ...b, y0: 16 - b.y1, y1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[4], b.tex[5]] }));
  // Horizontal: tumbado hacia el norte (la de arriba mira a −Z) y luego girado.
  const north = boxes.map((b) => ({
    x0: b.x0, x1: b.x1, y0: b.z0, y1: b.z1, z0: 16 - b.y1, z1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[4], b.tex[5], b.tex[3], b.tex[2]],
  }));
  return rotateBoxes(north, HFACE.indexOf(face));
}

/**
 * Orden de las caras en la propiedad `facing` de cada familia de 6 orientaciones: la primera es la del
 * estado base (el del objeto: así el icono y la mano enseñan el pistón hacia arriba y el frente del
 * observador, el dispensador y el soltador de cara).
 */
const FACING_ORDER = new Map<number, readonly number[]>();
const ORDER_UP: readonly number[] = [UP, DOWN, NORTH, SOUTH, WEST, EAST];
const ORDER_SOUTH: readonly number[] = [SOUTH, NORTH, EAST, WEST, UP, DOWN];

/** Familia de 6 orientaciones (`facing` y otras propiedades); `make` recibe la cara hacia la que mira. */
function sixWay(
  key: string, name: string, order: readonly number[], props: [string, number][], make: (face: number, st: Record<string, number>) => Opts,
): number {
  const base = family(key, name, [['facing', 6], ...props], (st) => make(order[st.facing], st));
  FACING_ORDER.set(base, order);
  return base;
}

/** Cara hacia la que mira un bloque de 6 orientaciones. */
export function facingOf(id: number): number {
  const b = familyBase(id);
  const v = (id - b) % 6;
  return FACING_ORDER.get(b)?.[v] ?? v;
}

/** Estado de un bloque de 6 orientaciones mirando a la cara `face` (`extra`: el resto de propiedades, 0 o 1). */
export function facingState(base: number, face: number, extra = 0): number {
  const b = familyBase(base);
  return b + (FACING_ORDER.get(b)?.indexOf(face) ?? face) + 6 * extra;
}

// ------------------------------------------------------------------ pistones

/** Etiquetas de las caras de los modelos del pistón (se cambian por texturas tras orientarlos). */
const T_FRONT = 100, T_BACK = 101, T_SIDE = 102, T_ARM = 103, T_INNER = 104, T_HEAD_BACK = 105;

/** Texturas de un modelo del pistón que mira hacia `facing`. */
function pistonTextures(boxes: ModelBox[], facing: number, sticky: boolean): ModelBox[] {
  const layer = (tag: number, f: number): number => {
    switch (tag) {
      case T_FRONT: return L(sticky ? 'piston_top_sticky' : 'piston_top');
      case T_HEAD_BACK: return L('piston_top');
      case T_BACK: return L('piston_bottom');
      case T_INNER: return L('piston_inner');
      case T_ARM: return L('oak_planks');
      case T_SIDE: return L(turned('piston_side', edgeTurn(f, facing)));
      default: return tag;
    }
  };
  return boxes.map((b) => ({ ...b, tex: b.tex.map((t, f) => layer(t, f)) }));
}

const N = -1;
/** Base extendida apuntando hacia arriba: 12/16 de alto con el hueco del brazo y el arranque del brazo. */
const BASE_UP: ModelBox[] = [
  mbox(0, 0, 0, 16, 12, 16, [T_SIDE, T_SIDE, T_INNER, T_BACK, T_SIDE, T_SIDE]),
  mbox(6, 12, 6, 10, 16, 10, [T_ARM, T_ARM, N, N, T_ARM, T_ARM]),
];
/** Cabeza apuntando hacia arriba: la tabla (4/16) y el brazo que baja hasta la base. */
const HEAD_UP: ModelBox[] = [
  mbox(0, 12, 0, 16, 16, 16, [T_SIDE, T_SIDE, T_FRONT, T_HEAD_BACK, T_SIDE, T_SIDE]),
  mbox(6, 0, 6, 10, 12, 10, [T_ARM, T_ARM, N, N, T_ARM, T_ARM]),
];

/** Caras de un pistón recogido (cubo entero) que mira hacia `facing`. */
function pistonCube(facing: number, sticky: boolean): BlockDef['tex'] {
  const tex = [0, 1, 2, 3, 4, 5].map((f) => turned('piston_side', edgeTurn(f, facing))) as BlockDef['tex'];
  tex[facing] = sticky ? 'piston_top_sticky' : 'piston_top';
  tex[facing ^ 1] = 'piston_bottom';
  return tex;
}

function piston(key: string, name: string, sticky: boolean): number {
  return sixWay(key, name, ORDER_UP, [['extended', 2]], (facing, st) => {
    const tex = pistonCube(facing, sticky);
    const base = { hardness: 1.5, tool: 'pickaxe' as const, sound: 'stone' as const, category: 'redstone' as const };
    if (!st.extended) return { ...base, tex };
    return {
      ...base, tex, render: R_MODEL, opaque: false, lightOpacity: 0,
      model: pistonTextures(pointBoxes(BASE_UP, facing), facing, sticky),
      itemModel: undefined,
    };
  });
}

export const PISTON = piston('piston', 'Pistón', false);
export const STICKY_PISTON = piston('sticky_piston', 'Pistón adhesivo', true);

/** Cabeza del pistón (la pone el pistón al extenderse; no se obtiene como objeto). */
export const PISTON_HEAD = sixWay('piston_head', 'Cabeza de pistón', ORDER_UP, [['sticky', 2]], (facing, st) => ({
  render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 1.5, tool: 'pickaxe', sound: 'stone', noItem: true, category: null,
  all: 'piston_top', model: pistonTextures(pointBoxes(HEAD_UP, facing), facing, st.sticky === 1),
}));

/**
 * Bloque en movimiento: el hueco que ocupa lo que empuja o recoge un pistón mientras se desliza (lo
 * dibuja el cliente aparte). No se ve, no choca y no se puede romper ni mover.
 */
export const MOVING_BLOCK = family('moving_piston', 'Bloque en movimiento', [], () => ({
  render: R_NONE, solid: false, opaque: false, lightOpacity: 0, hardness: -1, breakable: false, noItem: true, category: null,
  all: 'piston_side', collision: [], selection: [],
}));

export function isPiston(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === PISTON || b === STICKY_PISTON);
}
export function isStickyPiston(id: number): boolean {
  return id > 0 && familyBase(id) === STICKY_PISTON;
}
export function pistonExtended(id: number): boolean {
  return id - familyBase(id) >= 6;
}
/** El mismo pistón (normal o adhesivo) mirando a `facing`, extendido o no. */
export function pistonState(base: number, facing: number, extended: boolean): number {
  return facingState(base, facing, extended ? 1 : 0);
}
export function isPistonHead(id: number): boolean {
  return id > 0 && familyBase(id) === PISTON_HEAD;
}
export function headSticky(id: number): boolean {
  return id - PISTON_HEAD >= 6;
}
export function headState(facing: number, sticky: boolean): number {
  return facingState(PISTON_HEAD, facing, sticky ? 1 : 0);
}
export function isMovingBlock(id: number): boolean {
  return id === MOVING_BLOCK;
}

// Los pistones no conducen la potencia (como en Minecraft).
for (let i = 0; i < 12; i++) setConductor([PISTON + i, STICKY_PISTON + i], false);

// ------------------------------------------------------------------ observador

/** Observador: la cara (`facing`) mira al bloque que vigila; por detrás da un pulso al cambiar. */
export const OBSERVER = sixWay('observer', 'Observador', ORDER_SOUTH, [['powered', 2]], (facing, st) => {
  const tex = [0, 1, 2, 3, 4, 5].map((f) => {
    // La flecha de dos de los lados apunta hacia la salida; los otros dos, lisos.
    const vertical = facing === UP || facing === DOWN;
    const arrowFace = vertical ? f === 4 || f === 5 : f === UP || f === DOWN;
    return arrowFace ? turned('observer_top', edgeTurn(f, facing ^ 1)) : 'observer_side';
  }) as BlockDef['tex'];
  tex[facing] = 'observer_front';
  tex[facing ^ 1] = st.powered ? 'observer_back_on' : 'observer_back';
  return { tex, hardness: 3, tool: 'pickaxe', tier: 1, sound: 'stone', category: 'redstone' };
});

export function isObserver(id: number): boolean {
  return id > 0 && familyBase(id) === OBSERVER;
}
export function observerPowered(id: number): boolean {
  return id - OBSERVER >= 6;
}
export function observerWith(id: number, powered: boolean): number {
  return facingState(OBSERVER, facingOf(id), powered ? 1 : 0);
}

registerRedstone(OBSERVER, {
  emitter: {
    // Sólo por detrás (la cara opuesta a la que vigila), débil y fuerte.
    weak: (_v, _x, _y, _z, id, face) => (observerPowered(id) && face === (facingOf(id) ^ 1) ? 15 : 0),
    strong: (_v, _x, _y, _z, id, face) => (observerPowered(id) && face === (facingOf(id) ^ 1) ? 15 : 0),
    // El polvo se une a él sólo por detrás.
    connects: (id, face) => face === (facingOf(id) ^ 1),
  },
});
for (let i = 0; i < 12; i++) setConductor(OBSERVER + i, false);

// ------------------------------------------------------------------ tolva

/** Orientaciones de la tolva: 0 abajo y 1..4 norte, este, sur y oeste. */
export const HOPPER_DOWN = 0;

function hopperBoxes(facing: number): ModelBox[] {
  const out = L('hopper_outside'), inside = L('hopper_inside'), top = L('hopper_top');
  const boxes = [
    // Fondo del cuenco (por dentro se ve el interior) y las cuatro paredes con el borde arriba.
    mbox(0, 10, 0, 16, 11, 16, [out, out, inside, out, out, out]),
    mbox(0, 11, 0, 2, 16, 16, [inside, out, top, N, out, out]),
    mbox(14, 11, 0, 16, 16, 16, [out, inside, top, N, out, out]),
    mbox(2, 11, 0, 14, 16, 2, [N, N, top, N, inside, out]),
    mbox(2, 11, 14, 14, 16, 16, [N, N, top, N, out, inside]),
    // Embudo y pico.
    mbox(4, 4, 4, 12, 10, 12, out),
  ];
  if (facing === HOPPER_DOWN) boxes.push(mbox(6, 0, 6, 10, 4, 10, out));
  else boxes.push(...rotateBoxes([mbox(6, 4, 0, 10, 8, 4, out)], facing - 1));
  return boxes;
}

/** Tolva: pasa objetos hacia donde apunta su pico y coge los de encima; con potencia se bloquea. */
export const HOPPER = family('hopper', 'Tolva', [['facing', 5], ['locked', 2]], (st) => ({
  render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 3, tool: 'pickaxe', tier: 1, sound: 'metal', category: 'redstone',
  all: 'hopper_outside', model: hopperBoxes(st.facing), itemModel: hopperBoxes(HOPPER_DOWN),
}));

export function isHopper(id: number): boolean {
  return id > 0 && familyBase(id) === HOPPER;
}
/** Orientación de la tolva (0 abajo, 1..4 norte, este, sur, oeste). */
export function hopperFacing(id: number): number {
  return (id - HOPPER) % 5;
}
/** Cara (de api.ts) hacia la que pasa los objetos. */
export function hopperOutFace(id: number): number {
  const f = hopperFacing(id);
  return f === HOPPER_DOWN ? DOWN : HFACE[f - 1];
}
export function hopperLocked(id: number): boolean {
  return id - HOPPER >= 5;
}
export function hopperWith(id: number, locked: boolean): number {
  return HOPPER + hopperFacing(id) + (locked ? 5 : 0);
}

// ------------------------------------------------------------------ dispensador y soltador

function dispenserLike(key: string, name: string, front: string): number {
  return sixWay(key, name, ORDER_SOUTH, [['triggered', 2]], (facing) => {
    const vertical = facing === UP || facing === DOWN;
    const tex = [0, 1, 2, 3, 4, 5].map((f) => (vertical || f === UP || f === DOWN ? 'furnace_top' : 'furnace_side')) as BlockDef['tex'];
    tex[facing] = vertical ? `${front}_vertical` : front;
    return { tex, hardness: 3.5, tool: 'pickaxe', tier: 1, sound: 'stone', category: 'redstone' };
  });
}

/** Dispensador: con un pulso usa uno de sus objetos (dispara flechas, pone agua, enciende…). */
export const DISPENSER = dispenserLike('dispenser', 'Dispensador', 'dispenser_front');
/** Soltador: con un pulso suelta uno de sus objetos (o lo mete en el contenedor de delante). */
export const DROPPER = dispenserLike('dropper', 'Soltador', 'dropper_front');

export function isDispenser(id: number): boolean {
  return id > 0 && familyBase(id) === DISPENSER;
}
export function isDropper(id: number): boolean {
  return id > 0 && familyBase(id) === DROPPER;
}
export function isDispenserLike(id: number): boolean {
  return isDispenser(id) || isDropper(id);
}
export function dispenserTriggered(id: number): boolean {
  return id - familyBase(id) >= 6;
}
export function dispenserWith(id: number, triggered: boolean): number {
  return facingState(id, facingOf(id), triggered ? 1 : 0);
}

// ------------------------------------------------------------------ dinamita

/** Dinamita: se enciende con redstone, un mechero, fuego, una flecha en llamas o una explosión. */
export const TNT = family('tnt', 'Dinamita', [], () => ({
  side: 'tnt_side', top: 'tnt_top', bottom: 'tnt_bottom', hardness: 0, sound: 'grass', category: 'redstone',
}));
setConductor(TNT, false);

// ------------------------------------------------------------------ contenedores

/** Huecos del inventario de la tolva, el dispensador y el soltador (0 si no es uno de ellos). */
export function mechanismSlots(id: number): number {
  if (isHopper(id)) return 5;
  return isDispenserLike(id) ? 9 : 0;
}

/** Nombre de la ventana de su inventario. */
export function mechanismTitle(id: number): string {
  return isHopper(id) ? 'Tolva' : isDispenser(id) ? 'Dispensador' : isDropper(id) ? 'Soltador' : '';
}


// ------------------------------------------------------------------ inventario creativo

export const MECHANISM_INVENTORY: readonly number[] = [PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT];
