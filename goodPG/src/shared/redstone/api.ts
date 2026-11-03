// Fase 7 (redstone): registro abierto de la redstone. Cada tipo de bloque (por su estado base) puede
// declarar aquí lo que hace con la potencia sin tocar el motor (sim/server/redstone.ts):
// - emisor: cuánta potencia débil y fuerte da hacia cada cara (y si el polvo se une a él);
// - oyente: qué hace cuando cambia algo a su alrededor (la potencia que recibe, un vecino…);
// - tick: qué hace cuando vence un tick programado (repetidores, antorchas, botones…);
// - lectura analógica: lo que lee de él un comparador (lo lleno que está un cofre, un caldero…);
// - cambio: se coloca, se quita o cambia de estado (y al cargar su chunk);
// - pisado: hay una entidad en su celda (placas de presión, cuerda, mena de redstone);
// - proyectil: le da una flecha, un tridente o algo lanzado (diana);
// - periódico: se repite cada tantos ticks mientras está cargado (sensor de luz solar);
// - uso: qué pasa con el clic derecho (palancas, botones, repetidores…).
// Las funciones son puras sobre la RedstoneApi que reciben: sirven para cualquier servidor (el del
// Durable Object, el del modo un jugador y los de las pruebas). Ver docs/redstone.md.
import { familyBase, BLOCK_OPAQUE, BLOCK_COLLIDE } from '../blocks/registry';
import { MAX_BLOCK_ID } from '../constants';
import type { ItemStack } from '../items';

// ------------------------------------------------------------------ caras

/** Caras en el orden de las texturas de los bloques: 0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z. */
export const FACE_X: readonly number[] = [1, -1, 0, 0, 0, 0];
export const FACE_Y: readonly number[] = [0, 0, 1, -1, 0, 0];
export const FACE_Z: readonly number[] = [0, 0, 0, 0, 1, -1];
export const EAST = 0, WEST = 1, UP = 2, DOWN = 3, SOUTH = 4, NORTH = 5;
/** Cara opuesta. */
export const opposite = (face: number): number => face ^ 1;
/** Cara de cada dirección horizontal (0 norte, 1 este, 2 sur, 3 oeste; la de blockModels). */
export const HFACE: readonly number[] = [NORTH, EAST, SOUTH, WEST];
/** Dirección horizontal (0..3) de una cara horizontal; −1 si es vertical. */
export const faceDir = (face: number): number => HFACE.indexOf(face);

// Órdenes de Minecraft Java (auditoría de la redstone): de ellos depende el orden de las actualizaciones.
/** `Direction.values()`: abajo, arriba, norte, sur, oeste, este. */
export const JAVA_DIRECTIONS: readonly number[] = [DOWN, UP, NORTH, SOUTH, WEST, EAST];
/** `NeighborUpdater.UPDATE_ORDER`, el de los avisos a vecinos: oeste, este, abajo, arriba, norte, sur. */
export const UPDATE_ORDER: readonly number[] = [WEST, EAST, DOWN, UP, NORTH, SOUTH];
/** `BlockBehaviour.UPDATE_SHAPE_ORDER`, el de las actualizaciones de forma: oeste, este, norte, sur, abajo, arriba. */
export const SHAPE_ORDER: readonly number[] = [WEST, EAST, NORTH, SOUTH, DOWN, UP];
/** `Direction.Plane.HORIZONTAL`: norte, este, sur, oeste. */
export const HORIZONTAL: readonly number[] = [NORTH, EAST, SOUTH, WEST];

// Opciones de setBlock (los bits de `Block.UPDATE_*` de Java).
/** Avisar a los vecinos (neighborChanged). */
export const UPDATE_NEIGHBORS = 1;
/** Mandarlo a los clientes (aquí siempre se manda). */
export const UPDATE_CLIENTS = 2;
/** No actualizar las formas de los vecinos. */
export const UPDATE_KNOWN_SHAPE = 16;
/** Lo mueve un pistón (onPlace/onRemove lo saben). */
export const UPDATE_MOVE_BY_PISTON = 64;
/** Lo normal: avisar y mandar. */
export const UPDATE_ALL = UPDATE_NEIGHBORS | UPDATE_CLIENTS;

// ------------------------------------------------------------------ vista y API del motor

/** Lo mínimo para calcular potencias: bloques del mundo y el dato que guarda el motor por posición. */
export interface RedstoneView {
  /** Id del bloque (−1 si su chunk no está cargado). */
  getBlock(x: number, y: number, z: number): number;
  /** Dato numérico que guarda el motor en una posición (salida de un comparador, mirones de un cofre trampa…); 0 si no hay. */
  getData(x: number, y: number, z: number): number;
}

/** Qué entidades cuenta una placa de presión o un cable trampa. */
export type EntityFilter = 'all' | 'living' | 'arrows';

/** Prioridades de los ticks programados (las de Minecraft: antes las más bajas). */
export const PRIORITY_EXTREMELY_HIGH = -3, PRIORITY_VERY_HIGH = -2, PRIORITY_HIGH = -1, PRIORITY_NORMAL = 0;

/**
 * Lo que ofrece el motor de redstone del servidor a los componentes (los de esta fase y los que se
 * enganchen después: pistones, observadores, tolvas, dispensadores, raíles…).
 */
export interface RedstoneApi extends RedstoneView {
  /** Tick de juego actual (20 por segundo). */
  readonly gameTick: number;
  /**
   * Cambia un bloque (se difunde a los clientes). `flags`: las opciones de Java (UPDATE_ALL por defecto: avisa
   * a los vecinos y actualiza sus formas; UPDATE_CLIENTS sólo cambia el bloque y su onPlace/onRemove).
   */
  setBlock(x: number, y: number, z: number, id: number, flags?: number): void;
  /** Guarda un dato por posición (se borra solo cuando el bloque cambia de familia). */
  setData(x: number, y: number, z: number, value: number): void;
  /** Mayor potencia (0..15) que recibe (x, y, z) de sus seis vecinos (getBestNeighborSignal de Minecraft). */
  power(x: number, y: number, z: number): number;
  /** ¿Recibe (x, y, z) alguna potencia? (hasNeighborSignal de Minecraft). */
  isPowered(x: number, y: number, z: number): boolean;
  /** Potencia que llega a (x, y, z) desde el vecino de la cara `face` (getSignal de Minecraft). */
  powerFrom(x: number, y: number, z: number, face: number): number;
  /** Potencia fuerte que recibe el bloque (x, y, z) de sus vecinos (getDirectSignalTo de Minecraft). */
  strongPower(x: number, y: number, z: number): number;
  /**
   * Programa un tick dentro de `delay` ticks de juego (≥ 1) para el bloque que haya ahora en (x, y, z);
   * si ya hay uno pendiente en esa posición, no hace nada. Si el bloque cambia de familia, no se ejecuta.
   */
  schedule(x: number, y: number, z: number, delay: number, priority?: number): void;
  /** ¿Hay un tick pendiente en (x, y, z)? */
  isScheduled(x: number, y: number, z: number): boolean;
  /** ¿Vence en este mismo tick un tick pendiente en (x, y, z)? */
  willTickNow(x: number, y: number, z: number): boolean;
  /**
   * Avisa al bloque de (x, y, z) de que algo cambió en (fx, fy, fz) (neighborChanged de Java; por defecto, él
   * mismo). `src`: el bloque que avisa (el `sourceBlock` de Java; por defecto, el que hay en (fx, fy, fz)).
   */
  updateAt(x: number, y: number, z: number, fx?: number, fy?: number, fz?: number, src?: number): void;
  /**
   * Avisa a los seis vecinos de (x, y, z) en el orden de Java (updateNeighborsAt), salvo al de la cara `except`.
   * `src`: el bloque que avisa (por defecto, el que hay en (x, y, z)).
   */
  updateNeighbors(x: number, y: number, z: number, except?: number, src?: number): void;
  /**
   * La salida de un emisor en (x, y, z) cambió sin que cambiara su bloque (cofre trampa, sensor de sculk):
   * avisa a sus vecinos y a los del bloque de debajo (como hacen ellos en Java).
   */
  outputChanged(x: number, y: number, z: number): void;
  /**
   * El estado de (x, y, z) cambió sin cambiar su id (una propiedad que aquí va en el dato de posición, como el
   * `powered` de puertas y campanas): avisos y formas como si hubiera cambiado, con las opciones `flags`.
   */
  stateTouched(x: number, y: number, z: number, flags?: number): void;
  /** Apunta un evento de bloque (triggerEvent de Java: pistones, bloque musical…), que se atiende en su fase del tick. */
  blockEvent(x: number, y: number, z: number, a: number, b: number): void;
  /** Cambió lo que un comparador leería de (x, y, z) (el contenido de un contenedor): avisa a los comparadores cercanos. */
  analogChanged(x: number, y: number, z: number): void;
  /** Lectura analógica (0..15) del bloque de (x, y, z) para un comparador; −1 si no tiene. */
  analog(x: number, y: number, z: number): number;
  /** Entidades (jugadores incluidos) cuya caja toca la caja dada (coordenadas del mundo). */
  countEntities(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, filter: EntityFilter): number;
  /** Casillas de un contenedor (cofres —los dobles enteros—, hornos, barriles…) o null si no hay. */
  containerSlots(x: number, y: number, z: number): readonly (ItemStack | null)[] | null;
  /** Jugadores con el contenedor de (x, y, z) abierto. */
  viewers(x: number, y: number, z: number): number;
  /** Libro puesto en el atril de (x, y, z) (null si no tiene). */
  lecternBook(x: number, y: number, z: number): ItemStack | null;
  /** Disco del tocadiscos de (x, y, z) (índice de DISCS; −1 si no tiene). */
  jukeboxDisc(x: number, y: number, z: number): number;
  /** Lectura de un marco colgado en la celda de aire (x, y, z): giro + 1 si tiene objeto, 0 vacío, −1 si no hay. */
  frameSignal(x: number, y: number, z: number): number;
  /** Luz del sol (0..15) que lee un sensor de luz solar en (x, y, z). */
  sunlight(x: number, y: number, z: number, inverted: boolean): number;
  /** Efecto (sonido y partículas) para los jugadores cercanos. */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Número aleatorio en [0, 1). */
  rand(): number;
}

// ------------------------------------------------------------------ registro

/** Emisor de potencia. `face`: dirección del emisor hacia quien recibe. */
export interface Emitter {
  /** Potencia débil (0..15) hacia `face`: la que alimenta a un componente o al bloque de ese lado. */
  weak(v: RedstoneView, x: number, y: number, z: number, id: number, face: number): number;
  /** Potencia fuerte (0..15) hacia `face`: la que deja cargado al bloque de ese lado (por defecto, 0). */
  strong?(v: RedstoneView, x: number, y: number, z: number, id: number, face: number): number;
  /** ¿Se une el polvo a este bloque? `face`: dirección del bloque hacia el polvo. Por defecto, sí. */
  connects?(id: number, face: number): boolean;
}

/**
 * Algo cambió junto a (x, y, z) (un bloque vecino, la potencia que recibe…). (sx, sy, sz) es la
 * posición que provocó el aviso y `src` el bloque que avisa (el `sourceBlock` de Java: en un cambio de bloque,
 * el que había antes; en los avisos de un componente, el propio componente).
 */
export type NeighborHandler = (
  api: RedstoneApi, x: number, y: number, z: number, id: number, sx: number, sy: number, sz: number, src: number,
) => void;
/** Venció un tick programado en (x, y, z). */
export type TickHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => void;
/** Lo que lee un comparador (0..15). */
export type AnalogReader = (api: RedstoneApi, x: number, y: number, z: number, id: number) => number;
/** Clic derecho sobre el bloque en el servidor: devuelve si lo atendió. */
export type UseHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => boolean;
/**
 * onPlace / onRemove de Java: el bloque de (x, y, z) pasó de `old` a `id` (dentro del propio setBlock, antes de
 * avisar a los vecinos). `placed` es del bloque nuevo; `removed`, del viejo. `moved`: lo movió un pistón.
 */
export type PlaceHandler = (api: RedstoneApi, x: number, y: number, z: number, old: number, id: number, moved: boolean) => void;
/**
 * updateShape de Java: cambió el vecino de la cara `face` (de este bloque hacia él), que ahora es `nid`.
 * Devuelve el estado nuevo del bloque (el mismo si no cambia).
 */
export type ShapeHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number, face: number, nid: number) => number;
/** triggerEvent de Java: un evento de bloque apuntado con blockEvent. */
export type EventHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number, a: number, b: number) => void;
/**
 * El bloque de (x, y, z) pasó de `old` a `id` (uno de los dos es de esta familia): se colocó, se quitó
 * o cambió de estado. Al cargar su chunk se llama con old = −1 (y entonces no debe cambiar bloques: sólo anotar y programar).
 */
export type ChangeHandler = (api: RedstoneApi, x: number, y: number, z: number, old: number, id: number) => void;
/** Hay al menos una entidad en la celda (x, y, z) este tick (se llama una vez por tick y celda). */
export type SteppedHandler = (api: RedstoneApi, x: number, y: number, z: number, id: number) => void;
/** Un proyectil chocó con el bloque; (px, py, pz) es su último punto libre, justo delante de la cara tocada. */
export type ProjectileHandler = (
  api: RedstoneApi, x: number, y: number, z: number, id: number, px: number, py: number, pz: number, kind: ProjectileKind,
) => void;
export type ProjectileKind = 'arrow' | 'trident' | 'thrown';

/** Algo que se repite cada `every` ticks mientras el bloque está cargado (sensor de luz solar, tolvas…). */
export interface Periodic {
  every: number;
  run: TickHandler;
}

export interface RedstoneBehavior {
  emitter?: Emitter;
  neighbor?: NeighborHandler;
  placed?: PlaceHandler;
  removed?: PlaceHandler;
  shape?: ShapeHandler;
  event?: EventHandler;
  tick?: TickHandler;
  analog?: AnalogReader;
  changed?: ChangeHandler;
  stepped?: SteppedHandler;
  projectile?: ProjectileHandler;
  use?: UseHandler;
  periodic?: Periodic;
}

const EMITTERS: (Emitter | undefined)[] = [];
const NEIGHBOR: (NeighborHandler[] | undefined)[] = [];
const TICKS: (TickHandler | undefined)[] = [];
const ANALOG: (AnalogReader | undefined)[] = [];
const CHANGED: (ChangeHandler[] | undefined)[] = [];
const STEPPED: (SteppedHandler | undefined)[] = [];
const PROJECTILE: (ProjectileHandler | undefined)[] = [];
const USES: (UseHandler | undefined)[] = [];
const PERIODIC: (Periodic | undefined)[] = [];
const PLACED: (PlaceHandler[] | undefined)[] = [];
const REMOVED: (PlaceHandler[] | undefined)[] = [];
const SHAPES: (ShapeHandler | undefined)[] = [];
const EVENTS: (EventHandler | undefined)[] = [];
/** Conductores forzados: 1 conduce, 2 no conduce (0: lo decide su forma). */
const CONDUCTOR = new Uint8Array(MAX_BLOCK_ID);
/** Estados base que tienen algún comportamiento. */
const KNOWN = new Uint8Array(MAX_BLOCK_ID);

const bases = (b: number | readonly number[]): readonly number[] => (typeof b === 'number' ? [b] : b);

/**
 * Registra el comportamiento de redstone de uno o varios bloques (sus estados base: la familia entera).
 * Los oyentes y los avisos de cambio se acumulan; lo demás sustituye a lo anterior.
 */
export function registerRedstone(base: number | readonly number[], b: RedstoneBehavior): void {
  for (const id of bases(base)) {
    const f = familyBase(id);
    KNOWN[f] = 1;
    if (b.emitter) EMITTERS[f] = b.emitter;
    if (b.neighbor) (NEIGHBOR[f] ??= []).push(b.neighbor);
    if (b.tick) TICKS[f] = b.tick;
    if (b.analog) ANALOG[f] = b.analog;
    if (b.changed) (CHANGED[f] ??= []).push(b.changed);
    if (b.stepped) STEPPED[f] = b.stepped;
    if (b.projectile) PROJECTILE[f] = b.projectile;
    if (b.use) USES[f] = b.use;
    if (b.periodic) PERIODIC[f] = b.periodic;
    if (b.placed) (PLACED[f] ??= []).push(b.placed);
    if (b.removed) (REMOVED[f] ??= []).push(b.removed);
    if (b.shape) SHAPES[f] = b.shape;
    if (b.event) EVENTS[f] = b.event;
  }
}

/** Fuerza que un bloque (estados concretos) conduzca o no la potencia, sea cual sea su forma. */
export function setConductor(ids: number | readonly number[], conducts: boolean): void {
  for (const id of bases(ids)) CONDUCTOR[id] = conducts ? 1 : 2;
}

export function emitterOf(id: number): Emitter | undefined {
  return id > 0 ? EMITTERS[familyBase(id)] : undefined;
}
export function neighborHandlers(id: number): readonly NeighborHandler[] | undefined {
  return id > 0 ? NEIGHBOR[familyBase(id)] : undefined;
}
export function tickHandler(id: number): TickHandler | undefined {
  return id > 0 ? TICKS[familyBase(id)] : undefined;
}
export function analogReader(id: number): AnalogReader | undefined {
  return id > 0 ? ANALOG[familyBase(id)] : undefined;
}
export function changeHandlers(id: number): readonly ChangeHandler[] | undefined {
  return id > 0 ? CHANGED[familyBase(id)] : undefined;
}
export function steppedHandler(id: number): SteppedHandler | undefined {
  return id > 0 ? STEPPED[familyBase(id)] : undefined;
}
export function projectileHandler(id: number): ProjectileHandler | undefined {
  return id > 0 ? PROJECTILE[familyBase(id)] : undefined;
}
export function useHandler(id: number): UseHandler | undefined {
  return id > 0 ? USES[familyBase(id)] : undefined;
}
export function periodicOf(id: number): Periodic | undefined {
  return id > 0 ? PERIODIC[familyBase(id)] : undefined;
}
export function placedHandlers(id: number): readonly PlaceHandler[] | undefined {
  return id > 0 ? PLACED[familyBase(id)] : undefined;
}
export function removedHandlers(id: number): readonly PlaceHandler[] | undefined {
  return id > 0 ? REMOVED[familyBase(id)] : undefined;
}
export function shapeHandler(id: number): ShapeHandler | undefined {
  return id > 0 ? SHAPES[familyBase(id)] : undefined;
}
export function eventHandler(id: number): EventHandler | undefined {
  return id > 0 ? EVENTS[familyBase(id)] : undefined;
}
/** ¿Tiene el bloque algún comportamiento de redstone? */
export function hasRedstone(id: number): boolean {
  return id > 0 && KNOWN[familyBase(id)] === 1;
}
/**
 * ¿Conduce el bloque la potencia? (isRedstoneConductor de Minecraft): los cubos sólidos opacos, salvo
 * los que se fuerzan con setConductor (piedra luminosa, bloque de redstone, cofres…).
 */
export function isConductor(id: number): boolean {
  if (id <= 0) return false;
  const o = CONDUCTOR[id];
  if (o) return o === 1;
  return BLOCK_OPAQUE[id] === 1 && BLOCK_COLLIDE[id] === 1;
}
