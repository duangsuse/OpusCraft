// Tipos y utilidades compartidas del motor de audio.
import type { SoundMaterial } from '../../shared/blocks';

export type { SoundMaterial };

/** Vector de tres componentes en metros (1 bloque = 1 metro). */
export type Vec3 = readonly [number, number, number];

/** Estado ambiental que conduce el crossfade de la ambientación y la música. */
export interface AmbientState {
  /** -1 (medianoche) .. 1 (mediodía); es de día cuando > ~0. */
  sunHeight: number;
  /** 0..1: cuánto cielo abierto ve el jugador (0 = fondo de una cueva, 1 = exterior despejado). */
  skyExposure: number;
  /** La cámara está dentro del agua. */
  underwater: boolean;
  /** 0..1: cercanía a una masa de agua (ambiente de chapoteo de orilla). */
  waterProximity: number;
  /** Altura y de la cámara en bloques (nivel del mar = 63, montañas hasta ~200). */
  altitude: number;
  /** 0..1, intensidad de lluvia (puede quedarse en 0 por ahora, pero se implementa). */
  rain: number;
  /** Fase 8.2: bioma del Nether en el que está el jugador (−1 o sin él, fuera del Nether). */
  netherBiome?: number;
  /** Fase 8.6: suena la música del combate con el jefe (la barra del dragón a la vista). */
  boss?: boolean;
}

/** Tipos de golpe/interacción para un sonido de material. */
export type SoundKind = 'break' | 'place' | 'step' | 'land';

/** Sonidos cortos de interfaz. */
export type UiKind = 'click' | 'open' | 'close' | 'chat' | 'join' | 'leave'
  | 'portal'; // Fase 8 (dimensiones): el viaje por un portal

/** Criaturas con voz propia en el modo supervivencia. */
export type MobSoundKind =
  | 'pig'
  | 'cow'
  | 'sheep'
  | 'chicken'
  | 'zombie'
  | 'husk'
  | 'skeleton'
  | 'stray'
  | 'creeper'
  | 'spider'
  | 'enderman'
  | 'squid'
  // Fase 6 (aldeanos)
  | 'villager'
  | 'wandering_trader'
  // Fase 6 (fauna).
  | 'fox'
  | 'goat'
  | 'polar_bear'
  | 'rabbit'
  | 'wolf'
  | 'bee'
  | 'panda'
  | 'parrot'
  | 'armadillo'
  // Fase 6 (asaltos).
  | 'illager'
  | 'vex'
  | 'ravager'
  // Fase 7.5 (océano).
  | 'guardian'
  | 'elder_guardian'
  | 'warden' // Fase 7.5 (abismo)
  // Fase 7.5 (fauna).
  | 'bat'
  | 'ocelot'
  | 'skeleton_horse'
  | 'zombie_horse'
  | 'allay' // Fase 7.5 (mansión)
  // Fase 8.3 (criaturas del Nether).
  | 'piglin'
  | 'piglin_brute'
  | 'zombified_piglin'
  | 'ghast'
  | 'blaze'
  | 'magma_cube'
  | 'magma_cube_small'
  | 'hoglin'
  | 'zoglin'
  | 'strider'
  | 'wither_skeleton'
  | 'wither'; // Fase 8.7

/** Eventos de sonido que puede emitir una criatura. No todos los tipos usan todos los eventos
 * (p. ej. el creeper no tiene voz de `idle`); los combos no aplicables caen a un sonido genérico
 * razonable en vez de fallar o quedar en silencio inesperado. */
export type MobSoundEvent = 'idle' | 'hurt' | 'death' | 'step' | 'attack' | 'fuse' | 'teleport' | 'shoot';

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

export function choice<T>(arr: readonly T[]): T {
  const v = arr[(Math.random() * arr.length) | 0];
  return v as T;
}

export function vDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Punto aleatorio en una esfera (o casquete) alrededor de `center`, útil para colocar pájaros/grillos/goteras. */
export function randomPointAround(center: Vec3, minR: number, maxR: number): Vec3 {
  const r = randRange(minR, maxR);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(randRange(-1, 1));
  const x = center[0] + r * Math.sin(phi) * Math.cos(theta);
  const y = center[1] + r * Math.cos(phi) * 0.5; // aplanado: la mayoría de fuentes están cerca del plano horizontal
  const z = center[2] + r * Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}

/** Avanza un "paseo aleatorio" suavizado en [0,1], útil para ráfagas de viento u oleaje sin AudioWorklet. */
export class SmoothRandomWalk {
  private current: number;
  private target: number;
  private timeToChange: number;

  constructor(
    initial = 0.5,
    private minVal = 0,
    private maxVal = 1,
    private changeIntervalMin = 1.5,
    private changeIntervalMax = 5,
  ) {
    this.current = initial;
    this.target = initial;
    this.timeToChange = randRange(this.changeIntervalMin, this.changeIntervalMax);
  }

  step(dt: number): number {
    this.timeToChange -= dt;
    if (this.timeToChange <= 0) {
      this.target = randRange(this.minVal, this.maxVal);
      this.timeToChange = randRange(this.changeIntervalMin, this.changeIntervalMax);
    }
    // Aproximación exponencial hacia el objetivo: suave y barata de calcular por fotograma.
    const rate = 1 - Math.pow(0.001, dt);
    this.current += (this.target - this.current) * rate;
    return this.current;
  }

  get value(): number {
    return this.current;
  }
}
