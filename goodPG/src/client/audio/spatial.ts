// Sonido posicional (PannerNode) y gestión del pool de voces (límite de voces concurrentes,
// robo de la más antigua, limpieza de nodos al terminar).
import type { Vec3 } from './types';

export const MAX_ONE_SHOT_VOICES = 24;
export const REF_DISTANCE = 2;
export const MAX_DISTANCE = 48;
export const ROLLOFF_FACTOR = 1.2;

/** Interfaz mínima para el método heredado `setPosition`, retirado del estándar pero aún presente en algunos motores. */
interface LegacyPositional {
  setPosition?(x: number, y: number, z: number): void;
}

/** Crea un PannerNode posicional con HRTF (si el navegador lo soporta) o equalpower como respaldo. */
export function createPanner(ctx: AudioContext, pos: Vec3): PannerNode {
  const panner = ctx.createPanner();
  try {
    panner.panningModel = 'HRTF';
  } catch {
    panner.panningModel = 'equalpower';
  }
  panner.distanceModel = 'inverse';
  panner.refDistance = REF_DISTANCE;
  panner.maxDistance = MAX_DISTANCE;
  panner.rolloffFactor = ROLLOFF_FACTOR;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  setPannerPosition(panner, pos);
  return panner;
}

export function setPannerPosition(panner: PannerNode, pos: Vec3): void {
  if (panner.positionX) {
    panner.positionX.value = pos[0];
    panner.positionY.value = pos[1];
    panner.positionZ.value = pos[2];
  } else {
    (panner as unknown as LegacyPositional).setPosition?.(pos[0], pos[1], pos[2]);
  }
}

export function isWithinRange(listenerPos: Vec3, pos: Vec3): boolean {
  const dx = listenerPos[0] - pos[0];
  const dy = listenerPos[1] - pos[1];
  const dz = listenerPos[2] - pos[2];
  return dx * dx + dy * dy + dz * dz <= MAX_DISTANCE * MAX_DISTANCE;
}

/** Una voz activa: las fuentes que hay que poder detener y los nodos a desconectar cuando termine. */
export interface VoiceHandle {
  sources: AudioScheduledSourceNode[];
  extraNodes: AudioNode[];
  stopped: boolean;
}

/**
 * Limita el número de voces concurrentes: si se supera el máximo, roba (detiene y limpia)
 * la voz más antigua antes de añadir la nueva. Cada voz se limpia sola (disconnect) al
 * disparar su evento `ended`, así que no hace falta un bucle de recolección de basura.
 */
export class VoicePool {
  private active: VoiceHandle[] = [];

  constructor(private readonly max: number = MAX_ONE_SHOT_VOICES) {}

  get count(): number {
    return this.active.length;
  }

  spawn(sources: AudioScheduledSourceNode[], extraNodes: AudioNode[] = []): void {
    if (sources.length === 0) return;
    if (this.active.length >= this.max) {
      const oldest = this.active.shift();
      if (oldest) this.forceStop(oldest);
    }
    const handle: VoiceHandle = { sources, extraNodes, stopped: false };
    this.active.push(handle);
    const last = sources[sources.length - 1];
    last.addEventListener('ended', () => this.finish(handle), { once: true });
  }

  private finish(handle: VoiceHandle): void {
    if (handle.stopped) return;
    handle.stopped = true;
    const idx = this.active.indexOf(handle);
    if (idx >= 0) this.active.splice(idx, 1);
    for (const s of handle.sources) {
      try {
        s.disconnect();
      } catch {
        /* ya desconectado */
      }
    }
    for (const n of handle.extraNodes) {
      try {
        n.disconnect();
      } catch {
        /* ya desconectado */
      }
    }
  }

  private forceStop(handle: VoiceHandle): void {
    if (handle.stopped) return;
    for (const s of handle.sources) {
      try {
        s.stop();
      } catch {
        /* ya estaba detenida */
      }
    }
    this.finish(handle);
  }

  /** Detiene y limpia todas las voces activas (usado en dispose()). */
  clear(): void {
    for (const h of this.active.splice(0)) this.forceStop(h);
  }
}
