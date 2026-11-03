// Lo que los sistemas del servidor (bloques, granja, camas, contenedores, comandos…) necesitan del
// GameServer: el mundo, las entidades, el reloj y cómo hablar con los jugadores. Cada sistema recibe
// sólo esto, no el servidor entero.
import type { BossMode } from '../../bossRules';
import type { ContainerState } from '../../containers'; // Fase 8.6
import type { WireStack } from '../../protocol';
import type { ServerMsg, GameMode, PlayerSave } from '../../protocol';
import type { WorldSim } from '../WorldSim';
import type { Entities } from '../entities';
import { DAY_LENGTH_SECONDS } from '../../constants';

/** Conexión de un jugador (WebSocket del Durable Object o puerto del worker local). */
export interface Conn {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export interface Session {
  conn: Conn;
  id: string;
  joined: boolean;
  joinedAt: number;
  lastMsg: number;
  name: string;
  shirt: string;
  p: [number, number, number];
  r: [number, number];
  s: number;
  h: number;
  /** Objeto en la mano secundaria. */
  o: number;
  /** Armadura visible: ids [cabeza, pecho, piernas, pies] (0 = nada). */
  a: number[];
  /** Fase 7 (encantamientos): brillo de lo que lleva (bits de PlayerInfo.g). */
  g?: number;
  /** Fase 7 (remate): tipo de poción de lo que lleva en cada mano (PlayerInfo.hp y .op). */
  hp?: number;
  op?: number;
  /** Fase 7.6: escudo decorado en cada mano (clave de la decoración). */
  hs?: string;
  os?: string;
  /** Color de cada pieza de armadura teñida (PlayerInfo.ac). */
  ac?: number[];
  /** Chat de voz: tiene la voz activada (PlayerInfo.v). */
  voice?: boolean;
  mode: GameMode;
  lookAt: number;
  lookUntil: number;
  lastAttack: number;
  tokens: number;
  tokenTime: number;
  known: Map<number, string>;
  container: number | null;
  save: PlayerSave | null;
  saveDirty: boolean;
  /** Cama en la que duerme (clave de posición) y ticks que lleva dormido. */
  sleeping: number | null;
  sleepTicks: number;
  /** Cama donde reaparece (pies de la cama). Fase 8.5: o el nexo de reaparición (ver bedDim). */
  bed: [number, number, number] | null;
  /** Fase 8.5: dimensión del punto de reaparición (sin ella, el mundo normal). */
  bedDim?: number;
  /** Fase 7 (pociones): color de los remolinos de sus efectos (0 sin efectos). */
  ec?: number;
  /** Fase 8 (dimensiones): acaba de llegar de otra dimensión y su cliente aún no la ha montado. */
  dimPending?: boolean;
  /** Fase 8.6: lo que tiene en el cofre de ender (sus 27 huecos, los mismos en todos los cofres de ender). */
  ender?: ContainerState;
}

/** Lo que se guarda de cada jugador. */
export interface PlayerRecord {
  mode: GameMode;
  save: PlayerSave | null;
  bed?: [number, number, number] | null;
  /** Fase 8.5: dimensión del punto de reaparición (cama en el mundo normal, nexo en el Nether). */
  bedDim?: number;
  /** Fase 8: dimensión en la que está (sin ella, el mundo normal). */
  dim?: number;
  /** Fase 8.6: el cofre de ender (27 huecos). */
  ender?: (WireStack | null)[];
}

/** Fase 8 (dimensiones): cómo llega un jugador a una dimensión. */
export type Arrival =
  /** Por un portal: el sitio equivalente (ya escalado) y el eje del portal de salida. */
  | { kind: 'portal'; x: number; y: number; z: number; axis: number }
  /** A la cama o al punto de aparición (reaparecer). */
  | { kind: 'spawn' }
  /** A un punto concreto (comandos), o al punto de aparición de la dimensión si no se da. */
  | { kind: 'pos'; x?: number; y?: number; z?: number };

export interface ServerContext {
  readonly world: WorldSim;
  readonly entities: Entities;
  /** Fase 8: dimensión de este servidor. */
  readonly dim: number;
  /** Fase 8: lleva a un jugador a otra dimensión (false si no se puede: sin anfitrión de dimensiones). */
  travel(s: Session, dim: number, arrival: Arrival): boolean;
  /** Modo un jugador: sin límites de ritmo ni de distancia estrictos. */
  readonly local: boolean;
  readonly seed: number;
  /** Ticks desde que arrancó el servidor. */
  readonly tickCount: number;
  readonly playerCount: number;
  /** 0 pacífico .. 3 difícil. */
  readonly difficulty: number;
  rand(): number;
  /** Reloj (ms). */
  now(): number;
  /** Tiempo del mundo en días (la fracción es la hora). */
  worldTime(): number;
  sessions(): Iterable<Session>;
  send(s: Session, msg: ServerMsg): void;
  sendRaw(s: Session, data: string | ArrayBuffer): void;
  broadcast(msg: ServerMsg, except?: Session): void;
  /** Mensaje del sistema en el chat de un jugador. */
  tell(s: Session, text: string): void;
  /** Efecto puntual (sonido, partículas) para los jugadores cercanos. */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Límite de ritmo por jugador (token bucket). */
  allow(s: Session, cost: number): boolean;
  /** ¿Está el bloque al alcance del jugador? */
  reachOk(s: Session, x: number, y: number, z: number, max: number): boolean;
  /** Devuelve al jugador el bloque real (deshace su predicción). */
  reject(s: Session, x: number, y: number, z: number): void;
  /** Ejecuta cambios de bloques atribuidos a un jugador (los clientes lo usan para animaciones). */
  asActor<T>(id: string, fn: () => T): T;
  savePlayer(s: Session): void;
  setTime(days: number): void;
  setDifficulty(d: number): void;
  /** Jefes reforzados (bossRules.ts): el modo del mundo y cambiarlo. */
  readonly bossMode: BossMode;
  setBossMode(m: BossMode): void;
  /** Marca una entidad como recogida por un jugador (para la animación de recogida). */
  markCollected(entityId: number, playerId: string): void;
}

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const DAY_RATE = 1 / DAY_LENGTH_SECONDS;
/** Radio (en chunks) simulado alrededor de cada jugador. */
export const SIM_RADIUS = 4;

/** Redondeo a centésimas para la red. */
export const r2 = (v: number) => Math.round(v * 100) / 100;
