// Fase 7 (transporte): raíles. El normal tiene diez formas (recto norte-sur y este-oeste, cuatro cuestas
// y cuatro curvas); el propulsor, el detector y el activador sólo seis (sin curvas) y además pueden estar
// encendidos. Se dibujan como un plano pegado al suelo (o en cuesta) con R_RAIL, no chocan con nada y se
// caen si les quitan el bloque de debajo (las cuestas, también el del lado alto).
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, stateProps, BLOCK_SOLID, BLOCK_COLLIDE, R_RAIL, type NeighborGet } from './registry';
import { MAX_BLOCK_ID } from '../constants';

/** Formas de los raíles (el mismo orden que en Minecraft). */
export const RAIL_NS = 0, RAIL_EW = 1, RAIL_ASC_E = 2, RAIL_ASC_W = 3, RAIL_ASC_N = 4, RAIL_ASC_S = 5;
export const RAIL_SE = 6, RAIL_SW = 7, RAIL_NW = 8, RAIL_NE = 9;

/** Tipos de raíl: 1 normal, 2 propulsor, 3 detector, 4 activador. */
export const RAIL_PLAIN = 1, RAIL_POWERED = 2, RAIL_DETECTOR = 3, RAIL_ACTIVATOR = 4;

/** Forma de cada bloque de raíl (-1 si no es un raíl). */
export const RAIL_SHAPE = new Int8Array(MAX_BLOCK_ID).fill(-1);
/** Tipo de raíl de cada bloque (0 si no es un raíl). */
export const RAIL_KIND = new Uint8Array(MAX_BLOCK_ID);

/** ¿Es una cuesta? */
export const isAscending = (shape: number): boolean => shape >= RAIL_ASC_E && shape <= RAIL_ASC_S;

/** Lado alto de cada cuesta: [dx, dz]. */
const UPHILL: Record<number, [number, number]> = {
  [RAIL_ASC_E]: [1, 0], [RAIL_ASC_W]: [-1, 0], [RAIL_ASC_N]: [0, -1], [RAIL_ASC_S]: [0, 1],
};

export function uphillOf(shape: number): [number, number] | null {
  return UPHILL[shape] ?? null;
}

/** Suelo que aguanta un raíl: un bloque macizo entero (o sin cargar). */
function firmFloor(id: number): boolean {
  return id < 0 || (BLOCK_SOLID[id] === 1 && BLOCK_COLLIDE[id] === 1);
}

const FLAT_BOX = [0, 0, 0, 1, 2 / 16, 1];
const SLOPE_BOX = [0, 0, 0, 1, 8 / 16, 1];

function railOpts(tex: string, item: string, shape: number) {
  const up = UPHILL[shape];
  return {
    render: R_RAIL, solid: false, opaque: false, lightOpacity: 0, all: tex, flatItem: item, sound: 'metal' as const,
    hardness: 0.7, tool: 'pickaxe' as const, category: 'decoracion' as const,
    selection: up ? SLOPE_BOX : FLAT_BOX,
    support: (get: NeighborGet) => firmFloor(get(0, -1, 0)) && (!up || firmFloor(get(up[0], 0, up[1]))),
  };
}

function register(base: number, count: number, kind: number): void {
  for (let i = 0; i < count; i++) {
    RAIL_SHAPE[base + i] = stateProps(base + i)!.shape;
    RAIL_KIND[base + i] = kind;
  }
}

export const RAIL = family('rail', 'Raíl', [['shape', 10]], (st) =>
  railOpts(st.shape >= RAIL_SE ? 'rail_corner' : 'rail', 'rail', st.shape));
register(RAIL, 10, RAIL_PLAIN);

/** Raíles rectos que se encienden: forma (6) y encendido (2). */
function poweredFamily(key: string, name: string, kind: number): number {
  const base = family(key, name, [['shape', 6], ['powered', 2]], (st) =>
    railOpts(st.powered ? `${key}_on` : key, key, st.shape));
  register(base, 12, kind);
  return base;
}

export const POWERED_RAIL = poweredFamily('powered_rail', 'Raíl propulsor', RAIL_POWERED);
export const DETECTOR_RAIL = poweredFamily('detector_rail', 'Raíl detector', RAIL_DETECTOR);
export const ACTIVATOR_RAIL = poweredFamily('activator_rail', 'Raíl activador', RAIL_ACTIVATOR);

export const isRail = (id: number): boolean => id > 0 && RAIL_SHAPE[id] >= 0;
/** ¿Está encendido? (sólo propulsor, detector y activador). */
export const railIsPowered = (id: number): boolean => RAIL_KIND[id] > RAIL_PLAIN && stateProps(id)!.powered === 1;

/** Estado base de cada tipo de raíl. */
export const RAIL_BASES: Readonly<Record<number, number>> = {
  [RAIL_PLAIN]: RAIL, [RAIL_POWERED]: POWERED_RAIL, [RAIL_DETECTOR]: DETECTOR_RAIL, [RAIL_ACTIVATOR]: ACTIVATOR_RAIL,
};

/** El raíl de tipo `kind` con esa forma (y encendido o no). */
export function railState(kind: number, shape: number, powered = false): number {
  const base = RAIL_BASES[kind];
  if (kind === RAIL_PLAIN) return base + shape;
  return base + (shape % 6) + (powered ? 6 : 0);
}

export const RAIL_INVENTORY: readonly number[] = [RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL];
