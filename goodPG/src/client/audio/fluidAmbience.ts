// Ambientación de fluidos en movimiento: agua corriente (arroyo burbujeante) y lava (retumbe
// espeso con burbujeo). Igual que en ambience.ts, las capas continuas se crean una única vez en
// el constructor y solo se automatiza su ganancia/filtro; los "pops" discretos se sintetizan bajo
// demanda y se limpian solos. Barato y silencioso en 0: los nodos en bucle siguen sonando pero con
// ganancia ~0, exactamente como el resto de camas de ambience.ts.
import { playNoiseBurst, playPitchSweep } from './dsp';
import { noiseSource, type NoiseBuffers } from './noise';
import { VoicePool } from './spatial';
import { clamp01, randRange, SmoothRandomWalk } from './types';

export class FluidAmbience {
  private readonly pool = new VoicePool(6);
  private readonly loopSources: AudioScheduledSourceNode[] = [];

  private readonly waterFilter: BiquadFilterNode;
  private readonly waterGain: GainNode;
  private readonly lavaGain: GainNode;

  // Deriva lenta del centro de banda del agua: da la sensación de burbujeo variable sin coste de CPU.
  private readonly waterWobble = new SmoothRandomWalk(0.5, 0, 1, 0.6, 2.2);

  private waterTarget = 0;
  private lavaTarget = 0;
  private waterPopTimer = randRange(0.4, 1.2);
  private lavaPopTimer = randRange(0.8, 2);
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: NoiseBuffers,
    private readonly destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    // --- Agua corriente: ruido rosa en bucle, paso de banda modulado (borboteo del arroyo). ---
    const water = noiseSource(ctx, noise.pink, true);
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'bandpass';
    this.waterFilter.frequency.value = 700;
    this.waterFilter.Q.value = 1.4;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    water.connect(this.waterFilter).connect(this.waterGain).connect(this.destination);
    const waterWet = ctx.createGain();
    waterWet.gain.value = 0.2;
    this.waterGain.connect(waterWet);
    waterWet.connect(this.reverbSend);
    water.start();
    this.loopSources.push(water);

    // --- Lava: ruido marrón en bucle, paso bajo grave (retumbe espeso y viscoso). ---
    const lava = noiseSource(ctx, noise.brown, true);
    const lavaFilter = ctx.createBiquadFilter();
    lavaFilter.type = 'lowpass';
    lavaFilter.frequency.value = 220;
    this.lavaGain = ctx.createGain();
    this.lavaGain.gain.value = 0;
    lava.connect(lavaFilter).connect(this.lavaGain).connect(this.destination);
    const lavaWet = ctx.createGain();
    lavaWet.gain.value = 0.25;
    this.lavaGain.connect(lavaWet);
    lavaWet.connect(this.reverbSend);
    lava.start();
    this.loopSources.push(lava);
  }

  /** 0..1 cada uno: proximidad a agua corriente y a lava cercanas. El crossfade lo hace `update`. */
  setProximity(water: number, lava: number): void {
    this.waterTarget = clamp01(water);
    this.lavaTarget = clamp01(lava);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const tc = 0.7; // crossfade suave, ni brusco ni perezoso

    this.waterGain.gain.setTargetAtTime(this.waterTarget * 0.3, now, tc);
    this.lavaGain.gain.setTargetAtTime(this.lavaTarget * 0.28, now, tc);

    const wobble = this.waterWobble.step(dt);
    this.waterFilter.frequency.setTargetAtTime(500 + wobble * 500, now, 0.25);

    this.updateWaterBubbles(dt, now);
    this.updateLavaPops(dt, now);
  }

  private updateWaterBubbles(dt: number, now: number): void {
    this.waterPopTimer -= dt;
    if (this.waterPopTimer > 0) return;
    if (this.waterTarget > 0.03) {
      const src = playPitchSweep(this.ctx, { destination: this.destination, now, freqStart: randRange(500, 900), freqEnd: randRange(900, 1500), attack: 0.01, decay: randRange(0.05, 0.12), gain: randRange(0.05, 0.12) * (0.4 + this.waterTarget) });
      this.pool.spawn([src]);
      this.waterPopTimer = randRange(0.25, 1.1) / (0.3 + this.waterTarget);
    } else {
      this.waterPopTimer = randRange(0.5, 1);
    }
  }

  private updateLavaPops(dt: number, now: number): void {
    this.lavaPopTimer -= dt;
    if (this.lavaPopTimer > 0) return;
    if (this.lavaTarget > 0.03) {
      const sweep = playPitchSweep(this.ctx, { destination: this.destination, now, freqStart: randRange(150, 260), freqEnd: randRange(50, 100), attack: 0.006, decay: randRange(0.15, 0.3), gain: randRange(0.12, 0.22) * (0.4 + this.lavaTarget) });
      const plop = playNoiseBurst(this.ctx, { buffer: this.noise.pink, destination: this.destination, now, filterType: 'lowpass', freq: randRange(600, 1200), q: 0.6, attack: 0.005, decay: randRange(0.08, 0.15), gain: randRange(0.06, 0.12) * (0.4 + this.lavaTarget) });
      this.pool.spawn([sweep, plop]);
      this.lavaPopTimer = randRange(0.6, 2.2) / (0.3 + this.lavaTarget);
    } else {
      this.lavaPopTimer = randRange(1, 2);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.pool.clear();
    for (const s of this.loopSources) {
      try {
        s.stop();
      } catch {
        /* ya detenida */
      }
      try {
        s.disconnect();
      } catch {
        /* ya desconectada */
      }
    }
    try {
      this.waterFilter.disconnect();
      this.waterGain.disconnect();
      this.lavaGain.disconnect();
    } catch {
      /* ya desconectados */
    }
  }
}
