// Latido de salud baja: un doble golpe grave y suave que se acelera y se hace más presente cuanto
// menor es la salud. No posicional a propósito ("dentro de la cabeza" del jugador) y sin envío a
// la reverb: es un aviso de interfaz, no algo que ocurra en el mundo.
import { playTonalBlip } from './dsp';
import { clamp01 } from './types';

export class Heartbeat {
  private target = 0; // 0..1, salud baja (0 = apagado)
  private timer = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  setLevel(v: number): void {
    this.target = clamp01(v);
  }

  update(dt: number): void {
    if (this.target <= 0.003) {
      this.timer = 0; // barato: sin temporizador corriendo mientras está apagado
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.playThump();
      // Período entre ~1.1 s (aviso leve) y ~0.8 s (salud crítica): más rápido cuanta menos salud.
      this.timer = 1.1 - 0.3 * this.target;
    }
  }

  private playThump(): void {
    const now = this.ctx.currentTime;
    const vol = 0.12 + 0.32 * this.target;
    this.oneBeat(now, 120, vol);
    this.oneBeat(now + 0.14, 95, vol * 0.75);
  }

  private oneBeat(now: number, freq: number, gain: number): void {
    playTonalBlip(this.ctx, { destination: this.destination, now, freq, freqEnd: freq * 0.75, wave: 'sine', attack: 0.004, decay: 0.09, gain });
  }

  dispose(): void {
    this.target = 0;
    this.timer = 0;
  }
}
