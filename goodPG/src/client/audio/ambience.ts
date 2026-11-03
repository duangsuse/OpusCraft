// Ambientación continua (viento, cueva, orilla, lluvia, subacuático) más eventos discretos
// espaciados en el tiempo (pájaros, grillos, goteras, gotas de lluvia, burbujas). Las capas
// continuas se crean una única vez y solo se automatiza su ganancia/filtro; los eventos
// discretos se sintetizan bajo demanda y se limpian solos al terminar.
import { playNoiseBurst, playPitchSweep, scheduleEnvelope } from './dsp';
import type { NoiseBuffers } from './noise';
import { noiseSource } from './noise';
import { SEA_LEVEL } from '../../shared/constants';
import { createPanner, VoicePool } from './spatial';
import { clamp01, randRange, randomPointAround, SmoothRandomWalk, type AmbientState, type Vec3 } from './types';

export class AmbienceController {
  private readonly pool = new VoicePool(10);
  private readonly loopSources: AudioScheduledSourceNode[] = [];

  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly caveGain: GainNode;
  private readonly shoreFilter: BiquadFilterNode;
  private readonly shoreGain: GainNode;
  private readonly rainGain: GainNode;
  private readonly underwaterGain: GainNode;

  private readonly windGust = new SmoothRandomWalk(0.6, 0.35, 1, 2, 6);
  private readonly windTone = new SmoothRandomWalk(0.5, 0, 1, 3, 9);
  private time = 0;

  private birdTimer = randRange(2, 6);
  private cricketTimer = randRange(2, 6);
  private caveDripTimer = randRange(3, 8);
  private rainDropletTimer = 0.3;
  private underwaterBubbleTimer = randRange(1, 3);
  private shoreLapTimer = randRange(2, 5);

  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: NoiseBuffers,
    private readonly destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    // --- Viento: ruido rosa filtrado en bucle, con ráfagas y tono lentos. ---
    const wind = noiseSource(ctx, noise.pink, true);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.destination);
    const windWet = ctx.createGain();
    windWet.gain.value = 0.15;
    this.windGain.connect(windWet);
    windWet.connect(this.reverbSend);
    wind.start();
    this.loopSources.push(wind);

    // --- Cueva: drone grave con ligero "beating" entre dos senoidales desafinadas. ---
    const caveA = ctx.createOscillator();
    caveA.type = 'sine';
    caveA.frequency.value = 54;
    const caveB = ctx.createOscillator();
    caveB.type = 'sine';
    caveB.frequency.value = 58;
    const caveFilter = ctx.createBiquadFilter();
    caveFilter.type = 'lowpass';
    caveFilter.frequency.value = 160;
    this.caveGain = ctx.createGain();
    this.caveGain.gain.value = 0;
    caveA.connect(caveFilter);
    caveB.connect(caveFilter);
    caveFilter.connect(this.caveGain).connect(this.destination);
    const caveWet = ctx.createGain();
    caveWet.gain.value = 0.4;
    this.caveGain.connect(caveWet);
    caveWet.connect(this.reverbSend);
    caveA.start();
    caveB.start();
    this.loopSources.push(caveA, caveB);

    // --- Orilla: oleaje/chapoteo de agua cercana. ---
    const shore = noiseSource(ctx, noise.pink, true);
    this.shoreFilter = ctx.createBiquadFilter();
    this.shoreFilter.type = 'bandpass';
    this.shoreFilter.frequency.value = 500;
    this.shoreFilter.Q.value = 0.7;
    this.shoreGain = ctx.createGain();
    this.shoreGain.gain.value = 0;
    shore.connect(this.shoreFilter).connect(this.shoreGain).connect(this.destination);
    shore.start();
    this.loopSources.push(shore);

    // --- Lluvia: lecho de ruido filtrado (siseo). ---
    const rain = noiseSource(ctx, noise.white, true);
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 3500;
    rainFilter.Q.value = 0.5;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.destination);
    rain.start();
    this.loopSources.push(rain);

    // --- Bajo el agua: retumbe grave constante. ---
    const underwater = noiseSource(ctx, noise.brown, true);
    const underwaterFilter = ctx.createBiquadFilter();
    underwaterFilter.type = 'lowpass';
    underwaterFilter.frequency.value = 260;
    this.underwaterGain = ctx.createGain();
    this.underwaterGain.gain.value = 0;
    underwater.connect(underwaterFilter).connect(this.underwaterGain).connect(this.destination);
    underwater.start();
    this.loopSources.push(underwater);
  }

  update(dt: number, state: AmbientState, listenerPos: Vec3): void {
    if (this.disposed) return;
    this.time += dt;
    const now = this.ctx.currentTime;
    const tc = 0.6;

    // Viento: más fuerte en altura y a cielo abierto; casi silencioso bajo tierra.
    const altitudeFactor = clamp01((state.altitude - SEA_LEVEL) / 140);
    const gust = this.windGust.step(dt);
    const windTarget = clamp01(state.skyExposure) * (0.1 + 0.5 * altitudeFactor) * (0.5 + 0.7 * gust);
    this.windGain.gain.setTargetAtTime(windTarget, now, tc);
    const tone = this.windTone.step(dt);
    this.windFilter.frequency.setTargetAtTime(400 + tone * 1200, now, 1.2);

    // Cueva: drone grave cuando hay poca exposición al cielo (interior). Fase 8.2: en el Nether suena el
    // ambiente de su bioma (netherAmbience.ts), no el de las cuevas.
    const nether = (state.netherBiome ?? -1) >= 0;
    const caveTarget = nether ? 0 : Math.pow(clamp01(1 - state.skyExposure), 1.5) * 0.09;
    this.caveGain.gain.setTargetAtTime(caveTarget, now, tc);

    // Orilla: nivel ligado a la proximidad al agua, con oleaje lento.
    const swell = 0.6 + 0.4 * Math.sin(this.time * 0.5);
    const shoreTarget = clamp01(state.waterProximity) * 0.22 * swell;
    this.shoreGain.gain.setTargetAtTime(shoreTarget, now, tc);

    // Lluvia: nivel proporcional a la intensidad.
    const rainTarget = clamp01(state.rain) * 0.5;
    this.rainGain.gain.setTargetAtTime(rainTarget, now, tc);

    // Bajo el agua: retumbe grave (además del lowpass maestro que aplica el motor).
    const underwaterTarget = state.underwater ? 0.16 : 0;
    this.underwaterGain.gain.setTargetAtTime(underwaterTarget, now, 0.3);

    this.updateBirds(dt, state, listenerPos, now);
    this.updateCrickets(dt, state, listenerPos, now);
    if (!nether) this.updateCaveDrips(dt, state, listenerPos, now);
    this.updateRainDroplets(dt, state, listenerPos, now);
    this.updateUnderwaterBubbles(dt, state, listenerPos, now);
    this.updateShoreLaps(dt, state, listenerPos, now);
  }

  private spawnAt(pos: Vec3, dryLevel: number, wetLevel: number, now: number, build: (dest: AudioNode, now: number) => AudioScheduledSourceNode[]): void {
    const panner = createPanner(this.ctx, pos);
    const dry = this.ctx.createGain();
    dry.gain.value = dryLevel;
    const wet = this.ctx.createGain();
    wet.gain.value = wetLevel;
    panner.connect(dry).connect(this.destination);
    panner.connect(wet);
    wet.connect(this.reverbSend);
    const sources = build(panner, now);
    this.pool.spawn(sources, [panner, dry, wet]);
  }

  private updateBirds(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.birdTimer -= dt;
    if (this.birdTimer > 0) return;
    if (state.sunHeight > 0.05 && state.skyExposure > 0.55) {
      this.playBirdChirp(listenerPos, now);
      this.birdTimer = randRange(3, 8);
    } else {
      this.birdTimer = randRange(1, 3);
    }
  }

  private updateCrickets(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.cricketTimer -= dt;
    if (this.cricketTimer > 0) return;
    if (state.sunHeight < -0.02 && state.skyExposure > 0.5) {
      this.playCricketChirr(listenerPos, now);
      this.cricketTimer = randRange(0.4, 1.4);
    } else {
      this.cricketTimer = randRange(1, 3);
    }
  }

  private updateCaveDrips(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.caveDripTimer -= dt;
    if (this.caveDripTimer > 0) return;
    if (state.skyExposure < 0.35) {
      this.playCaveDrip(listenerPos, now);
      this.caveDripTimer = randRange(4, 12);
    } else {
      this.caveDripTimer = randRange(2, 5);
    }
  }

  private updateRainDroplets(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.rainDropletTimer -= dt;
    if (this.rainDropletTimer > 0) return;
    const rain = clamp01(state.rain);
    if (rain > 0.02) {
      this.playRainDroplet(listenerPos, now);
      this.rainDropletTimer = (2.5 - 2.42 * rain) * randRange(0.7, 1.3);
    } else {
      this.rainDropletTimer = 0.4;
    }
  }

  private updateUnderwaterBubbles(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.underwaterBubbleTimer -= dt;
    if (this.underwaterBubbleTimer > 0) return;
    if (state.underwater) {
      this.playUnderwaterBubble(listenerPos, now);
      this.underwaterBubbleTimer = randRange(1.5, 4);
    } else {
      this.underwaterBubbleTimer = randRange(1, 2);
    }
  }

  private updateShoreLaps(dt: number, state: AmbientState, listenerPos: Vec3, now: number): void {
    this.shoreLapTimer -= dt;
    if (this.shoreLapTimer > 0) return;
    if (state.waterProximity > 0.05) {
      this.playShoreLap(listenerPos, now);
      this.shoreLapTimer = randRange(1.5, 5) / (0.3 + clamp01(state.waterProximity));
    } else {
      this.shoreLapTimer = randRange(1, 3);
    }
  }

  private playBirdChirp(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 4, 14);
    this.spawnAt(pos, 0.5, 0.25, now, (dest, t) => {
      const sources: AudioScheduledSourceNode[] = [];
      const segments = 2 + Math.floor(Math.random() * 3);
      let cursor = t;
      for (let i = 0; i < segments; i++) {
        const start = randRange(2200, 4200);
        const end = Math.max(400, start + randRange(-800, 1400));
        sources.push(
          playPitchSweep(this.ctx, { destination: dest, now: cursor, freqStart: start, freqEnd: end, attack: 0.005, decay: randRange(0.05, 0.1), gain: randRange(0.2, 0.35) }),
        );
        cursor += randRange(0.06, 0.13);
      }
      return sources;
    });
  }

  private playCricketChirr(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 3, 10);
    this.spawnAt(pos, 0.35, 0.15, now, (dest, t) => {
      const ctx = this.ctx;
      const pulses = 2 + Math.floor(Math.random() * 3);
      const sources: AudioScheduledSourceNode[] = [];
      let cursor = t;
      const carrierFreq = randRange(3800, 5200);
      for (let i = 0; i < pulses; i++) {
        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = carrierFreq * randRange(0.98, 1.02);
        const gain = ctx.createGain();
        const dur = randRange(0.05, 0.09);
        scheduleEnvelope(gain.gain, cursor, 0.006, randRange(0.12, 0.22), dur);
        carrier.connect(gain).connect(dest);
        carrier.start(cursor);
        carrier.stop(cursor + dur + 0.05);
        carrier.addEventListener(
          'ended',
          () => {
            try {
              gain.disconnect();
            } catch {
              /* ya desconectado */
            }
          },
          { once: true },
        );
        sources.push(carrier);
        cursor += dur + randRange(0.02, 0.05);
      }
      return sources;
    });
  }

  private playCaveDrip(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 5, 20);
    this.spawnAt(pos, 0.12, 0.7, now, (dest, t) => {
      const freq = randRange(1200, 2200);
      return [
        playPitchSweep(this.ctx, { destination: dest, now: t, freqStart: freq, freqEnd: freq * 0.85, attack: 0.002, decay: randRange(0.25, 0.5), gain: randRange(0.2, 0.35) }),
      ];
    });
  }

  private playRainDroplet(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 2, 12);
    this.spawnAt(pos, 0.25, 0.2, now, (dest, t) => [
      playNoiseBurst(this.ctx, { buffer: this.noise.white, destination: dest, now: t, filterType: 'highpass', freq: randRange(2500, 5000), attack: 0.001, decay: randRange(0.02, 0.05), gain: randRange(0.12, 0.22) }),
    ]);
  }

  private playUnderwaterBubble(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 1, 5);
    this.spawnAt(pos, 0.3, 0.2, now, (dest, t) => [
      playPitchSweep(this.ctx, { destination: dest, now: t, freqStart: randRange(200, 500), freqEnd: randRange(600, 1200), attack: 0.02, decay: randRange(0.1, 0.2), gain: randRange(0.15, 0.28) }),
    ]);
  }

  private playShoreLap(listenerPos: Vec3, now: number): void {
    const pos = randomPointAround(listenerPos, 3, 10);
    this.spawnAt(pos, 0.2, 0.25, now, (dest, t) => [
      playNoiseBurst(this.ctx, {
        buffer: this.noise.pink,
        destination: dest,
        now: t,
        filterType: 'bandpass',
        freq: randRange(350, 700),
        freqEnd: randRange(180, 320),
        q: 0.8,
        attack: 0.05,
        decay: randRange(0.5, 0.9),
        gain: randRange(0.15, 0.3),
      }),
    ]);
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
      this.windFilter.disconnect();
      this.windGain.disconnect();
      this.caveGain.disconnect();
      this.shoreFilter.disconnect();
      this.shoreGain.disconnect();
      this.rainGain.disconnect();
      this.underwaterGain.disconnect();
    } catch {
      /* ya desconectados */
    }
  }
}
