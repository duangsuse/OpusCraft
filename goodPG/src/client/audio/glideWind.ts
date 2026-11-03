// Fase 8.6 (el End): el viento al planear con élitros (ElytraOnPlayerSoundInstance: calla el primer segundo, sube en el
// siguiente, el volumen va con el cuadrado de la velocidad y, pasado el 80 %, también el tono). Ruido rosa en bucle por
// dos filtros: un silbido de banda que sube con la velocidad y un rugido grave que da cuerpo; no posicional (es el aire
// que pasa por los oídos del que vuela).
import { noiseSource, type NoiseBuffers } from './noise';
import { clamp01 } from './types';

export class GlideWind {
  private src: AudioBufferSourceNode | null = null;
  private band: BiquadFilterNode | null = null;
  private low: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private volume = 0;
  private pitch = 1;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: NoiseBuffers,
    private readonly destination: AudioNode,
  ) {}

  /** Volumen (0..1) y tono (1..1,2) de este frame. */
  set(volume: number, pitch: number): void {
    this.volume = clamp01(volume);
    this.pitch = pitch;
  }

  update(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.volume <= 0.002) {
      if (this.gain) {
        this.gain.gain.setTargetAtTime(0, now, 0.15);
        const src = this.src;
        this.src = null;
        this.gain = null;
        setTimeout(() => {
          try {
            src?.stop();
          } catch {
            /* ya parada */
          }
        }, 800);
      }
      return;
    }
    if (!this.gain) {
      const src = noiseSource(ctx, this.noise.pink, true);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.8;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 2200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(low).connect(gain).connect(this.destination);
      src.start(now, Math.random() * 2);
      this.src = src;
      this.band = band;
      this.low = low;
      this.gain = gain;
    }
    const v = this.volume;
    this.band!.frequency.setTargetAtTime((260 + 900 * v) * this.pitch, now, 0.1);
    this.low!.frequency.setTargetAtTime((1200 + 2600 * v) * this.pitch, now, 0.1);
    this.src!.playbackRate.setTargetAtTime(0.85 + 0.3 * v * this.pitch, now, 0.1);
    this.gain!.gain.setTargetAtTime(v * 0.55, now, 0.08);
  }

  dispose(): void {
    try {
      this.src?.stop();
    } catch {
      /* ya parada */
    }
    this.src = null;
    this.gain = null;
  }
}

/** Volumen y tono de Java con `ticks` planeando y la velocidad al cuadrado (bloques por tick). */
export function glideWindLevel(ticks: number, speedSq: number): [number, number] {
  let volume = speedSq >= 1e-7 ? Math.min(1, speedSq / 4) : 0;
  if (ticks < 20) volume = 0;
  else if (ticks < 40) volume *= (ticks - 20) / 20;
  return [volume, volume > 0.8 ? 1 + (volume - 0.8) : 1];
}
