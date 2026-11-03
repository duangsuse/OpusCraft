// Tipos y constantes compartidos por el gestor de entidades y sus comportamientos.
import type { ItemStack } from '../../items';
import type { Body } from '../physics';
import type { PathNode } from '../pathfind';
import type { WorldSim } from '../WorldSim';
import type { VillagerData } from './villagerLife'; // Fase 6 (aldeanos)
import type { MobEffect } from './mobEffects'; // Fase 7 (pociones)

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  alive: boolean;
  creative: boolean;
  /** Entidad a la que mira (para los enderman). */
  lookingAt: number;
  /** Objeto en la mano (los animales siguen a quien lleva su comida). */
  held?: number;
  /** Fase 6.5 (colecciones): lo que lleva en el hueco del casco (las cabezas disimulan). */
  head?: number;
  /** Fase 7 (pociones): invisible (las criaturas lo ven de mucho más cerca) y piezas de armadura puestas. */
  invisible?: boolean;
  armorPieces?: number;
  /** Fase 7 (pociones): efectos que tiene y vida (lo que sabe el servidor; las brujas eligen poción según eso). */
  fx?: ReadonlySet<number>;
  hp?: number;
  /** Fase 7 (efectos): buceando (los delfines que no están enfadados le dan Gracia del delfín). */
  swimming?: boolean;
  /** Fase 8.3 (criaturas del Nether): armadura puesta [cabeza, pecho, piernas, pies] (el oro calma a los piglins) y mano secundaria. */
  armor?: readonly number[];
  offhand?: number;
}

export interface EntityHost {
  world: WorldSim;
  players(): PlayerView[];
  /** Altura del sol (-1..1). */
  sunHeight(): number;
  /** Tiempo del mundo en días (0 = amanecer): la reposición y los cotilleos de los aldeanos. */
  worldTime(): number;
  raining(): number;
  /** 0 pacífico, 1 fácil, 2 normal, 3 difícil. */
  difficulty(): number;
  /** ¿Van reforzados los jefes? (bossRules.ts: «/jefes»). */
  hardBosses(): boolean;
  /** Fase 7 (encantamientos): `src`, la criatura que golpea cuerpo a cuerpo (Espinas). */
  hurtPlayer(id: string, amount: number, kx: number, ky: number, kz: number, cause: string, src?: Entity): void;
  /** Efecto puntual para los clientes (sonidos, partículas). */
  fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void;
  /** Cambia un bloque desde la simulación (explosiones, etc.). */
  breakBlock(x: number, y: number, z: number, drop: boolean): void;
  /** Un bloque que caía toca el suelo en la celda (x, y, z). */
  landBlock(x: number, y: number, z: number, block: number): void;
  /** Una criatura cae sobre tierra de cultivo y la pisotea. */
  trample(x: number, y: number, z: number): void;
  /** Un jugador recoge orbes de experiencia por valor de `n`. */
  giveXp(playerId: string, n: number): void;
  /**
   * Fase 6 (monstruos): efecto de estado a un jugador (veneno de la araña de cueva, pociones de bruja).
   * Fase 7 (pociones): en los instantáneos, `seconds` es la fuerza (0..1); `creativeToo`, también a los
   * jugadores en creativo (las pociones les afectan, aunque el daño no).
   */
  effectPlayer?(id: string, effect: number, seconds: number, amp: number, creativeToo?: boolean): void;
  /**
   * Fase 7 (redstone): un proyectil se clava en el bloque (bx, by, bz) desde el punto libre (px, py, pz)
   * (diana, botones de madera).
   */
  projectileHit?(kind: 'arrow' | 'trident' | 'thrown', bx: number, by: number, bz: number, px: number, py: number, pz: number, fire?: boolean): void; // Fase 7 (mecanismos): fire, flecha en llamas
  /** Fase 8.3 (criaturas del Nether): enciende fuego en la celda (bolas de fuego); true si prendió. */
  igniteBlock?(x: number, y: number, z: number): boolean;
  /** Fase 8.6: lleva a un jugador a (x, y, z) de esta dimensión (la perla de ender). */
  teleportPlayer?(id: string, x: number, y: number, z: number): void;
}

/** Resultado de usar un objeto sobre una criatura (lo que cambia en la mano del jugador). */
export interface InteractResult {
  ok: boolean;
  /** Objetos que se gastan de la mano. */
  take?: number;
  /** Objeto que se recibe a cambio (cubo de leche). */
  give?: ItemStack;
  /** Desgaste de la herramienta (tijeras). */
  wear?: number;
}

/** Segundos que tarda una cría en crecer (Minecraft: 20 minutos). */
export const GROW_SECONDS = 1200;
export const LOVE_SECONDS = 30;
export const BREED_COOLDOWN = 300;

export interface AI {
  target: string | null;
  goal: PathNode | null;
  path: PathNode[] | null;
  pathIdx: number;
  repath: number;
  think: number;
  attackCd: number;
  shootCd: number;
  fuse: number;
  angry: number;
  panic: number;
  panicFrom: [number, number];
  stuck: number;
  lastX: number;
  lastZ: number;
  swimDir: [number, number, number];
  lookYaw: number;
  teleportCd: number;
  /** Dirección elegida por animalGoal: [x, z, velocidad, saltar]. */
  goalDir: [number, number, number, number];
  lookAt: [number, number, number] | null;
}

export interface Entity extends Body {
  id: number;
  type: number;
  yaw: number;
  pitch: number;
  bodyYaw: number;
  health: number;
  maxHealth: number;
  hurt: number;
  invuln: number;
  dead: boolean;
  deathTime: number;
  fire: number;
  burnAcc: number;
  age: number;
  fallStart: number;
  despawn: boolean;
  // Objetos
  stack?: ItemStack;
  pickupDelay?: number;
  owner?: string;
  /** Fase 8.6: cohete pegado a un jugador que planea con élitros (su id de sesión). */
  attached?: string;
  // Flechas
  shooter?: string | number;
  arrowDamage?: number;
  stuck?: boolean;
  // Pesca: segundos hasta que pique y lo que queda de la picada (> 0: está picando).
  fishWait?: number;
  fishBite?: number;
  // Fase 8.6: ojo de ender en vuelo: a dónde va, si caerá entero y los ticks que lleva (y el resto del tick).
  eyeTarget?: [number, number, number];
  eyeSurvive?: boolean;
  eyeLife?: number;
  eyeAcc?: number;
  // Bloques que caen
  block?: number;
  // Orbes de experiencia
  xp?: number;
  // Criaturas: último jugador que la hirió y cuándo (edad de la entidad), para la experiencia.
  lastHurtBy?: string;
  lastHurtAt?: number;
  // Animales
  /** Segundos que le faltan para ser adulto (> 0: cría). */
  growAge?: number;
  /** Segundos que le quedan en modo amor (buscando pareja). */
  love?: number;
  /** Espera hasta poder volver a criar. */
  breedCd?: number;
  sheared?: boolean;
  /** Gallinas: segundos hasta el próximo huevo. */
  eggTimer?: number;
  // Fase 6 (monturas)
  /** Variante visual para los clientes: pelaje (caballos, llamas) o profesión (aldeanos). */
  variant?: number;
  tamed?: boolean;
  /** Paciencia ganada al montarla o darle de comer (0..100): cuanto más, más fácil domarla. */
  temper?: number;
  saddled?: boolean;
  /** Jugador que la monta. */
  rider?: string;
  /** Velocidad (bloques/s) y fuerza de salto de la montura. */
  mountSpeed?: number;
  mountJump?: number;
  /** Segundos que le quedan encabritada (tras tirar al jinete). */
  rear?: number;
  ai?: AI;
  // Fase 6 (aldeanos): profesión, comercio y hogar (aldeanos y comerciante ambulante).
  villager?: VillagerData;
  // Fase 6 (gólems/domesticar)
  /** Dueño de un animal domesticado (nombre del jugador en minúsculas). */
  tamedBy?: string;
  /** Domesticado y sentado: no sigue al dueño. */
  sitting?: boolean;
  /** Siguiendo al dueño (con histéresis para no dar tirones). */
  following?: boolean;
  /** Gólem construido por un jugador (los de las aldeas, no). */
  playerMade?: boolean;
  /** Enemigo de un gólem o de un lobo domesticado: id de entidad o id de sesión de un jugador. */
  foe?: number | string;
  /** Gólem de nieve: segundos acumulados derritiéndose (1 de daño por segundo). */
  meltAcc?: number;
  // Fase 6 (asaltos)
  /** Asalto al que pertenece (no desaparece mientras dure). */
  raid?: number;
  /** Capitán de una patrulla o de una oleada: lleva el estandarte y suelta la botella ominosa. */
  captain?: boolean;
  /** Patrulla: punto hacia el que camina. */
  patrolTo?: [number, number];
  // Fase 6.5 (remate)
  /** Nombre puesto con una etiqueta (la criatura ya no desaparece). */
  customName?: string;
  /** Atada con una correa: al jugador (id de sesión) o a una valla (posición). */
  leash?: string | [number, number, number];
  /** Soporte para armadura: la armadura puesta [cabeza, pecho, piernas, pies] (ids, 0 = nada). */
  standArmor?: number[];
  /** Fase 7 (encantamientos): piezas del soporte que brillan (bit 0 cabeza … 3 pies). */
  standGlint?: number;
  /** Color de cada pieza teñida del soporte (0xRRGGBB, −1 sin teñir). */
  standDye?: number[];
  /** Punto del que tira su correa ahora mismo (lo pone el sistema de correas cada tick). */
  leashTo?: [number, number, number];
  /** Fase 6.5 (colecciones): creeper cargado por un rayo. */
  charged?: boolean;
  // Fase 6.5 (equipo)
  /** Armadura puesta (caballo, lobo) u objeto en la mano (tridente o concha de un ahogado). */
  gear?: number;
  /** Desgaste de la armadura para lobo. */
  gearDmg?: number;
  /** Color de la armadura teñida (armadura de cuero para caballo, armadura para lobo). */
  gearDye?: number;
  /** Velocidad con la que el jinete guía al cerdo con la caña con zanahoria (junto con leashTo). */
  steerSpeed?: number;
  /** Cabra: fase de la embestida (s; > 0 en curso), dirección, cuernos que le quedan y espera. */
  ramT?: number;
  ramDir?: [number, number];
  horns?: number;
  ramCd?: number;
  /** Ahogado con tridente: espera hasta el próximo lanzamiento. */
  throwCd?: number;
  /** Cohete: segundos de vuelo que le quedan. */
  fuse?: number;
  // Fase 7 (pociones)
  /** Efectos de estado de la criatura (ver mobEffects.ts) y espera hasta sus próximos remolinos. */
  effects?: Map<number, MobEffect>;
  swirl?: number;
  /** Flecha con efecto: tipo de poción. */
  arrowPotion?: number;
  /** Nube de efecto: tipo de poción, radio, espera antes de empezar y a quién afectó (id → edad). */
  cloudPotion?: number;
  cloudRadius?: number;
  cloudWait?: number;
  cloudVictims?: Map<string | number, number>;
  /** Fase 8.6: nube del aliento del dragón: crecimiento (bloques por segundo), vida (s) y nivel del daño instantáneo. */
  dragonBreath?: { grow: number; life: number; amp: number };
  /** Fase 8.6: no se le puede herir (los cristales de los pilares mientras reaparece el dragón). */
  invulnerable?: boolean;
  /** Fase 7 (transporte): barca o vagoneta en la que va sentada la criatura (id de la entidad). */
  vehicle?: number;
  // Fase 7 (encantamientos)
  /** Flecha: empuje (Retroceso), prende lo que toca (Fuego), no se recoge (Infinidad, virotes laterales). */
  arrowKnock?: number;
  arrowFire?: boolean;
  noPickup?: boolean;
  /** Flecha con Perforación: criaturas que aún puede atravesar y las que ya atravesó. */
  pierce?: number;
  pierced?: number[];
  /** Tridente con Lealtad volviendo a su dueño. */
  returning?: boolean;
  /** Flotador: Suerte marina y Atracción de la caña. */
  luck?: number;
  lure?: number;
  /** Bloque que cae: altura desde la que empezó a caer (el yunque hiere según la caída). */
  fallFrom?: number;
  /**
   * Fase 7.5 (océano, mansión): criatura de estructura (guardián anciano, ahogados de las ruinas, illagers
   * de la mansión, alays): no desaparece (ni lejos de los jugadores ni al reciclar animales) y se guarda.
   */
  persist?: boolean;
  // Fase 8.3 (criaturas del Nether)
  /** Criatura sobre la que va montada (el piglin zombificado sobre su strider, el strider cría, el piglin cría). */
  mountId?: number;
  /** Inventario del piglin (8 huecos: pepitas y lo que admiró y no se puso). */
  pinv?: ItemStack[];
  /** Bit de estado para los clientes: 1 herido reciente, 2 ardiendo, 4 muerto, 8 enfadado, 16 disparando/mecha. */
  flags: number;
}

export const GRAVITY = 32;
export const TAU = Math.PI * 2;
/** Límites globales (protegen la memoria y la CPU del servidor): se retiran los más viejos. */
export const MAX_ITEMS = 800;
export const MAX_ARROWS = 200;
export const MAX_XP_ORBS = 400;
/** Animales en todo el mundo; al llegar al límite se reciclan los que están lejos de todos. */
export const MAX_PASSIVE = 300;
/** Distancia a los jugadores a partir de la cual una entidad queda congelada (no se simula). */
export const ACTIVE_RANGE = 128;

export function angleTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI;
  if (!Number.isFinite(d)) d = 0;
  return a + d * Math.min(1, t);
}
