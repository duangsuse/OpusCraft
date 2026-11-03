// Fase 8.2 (biomas del Nether): el ambiente sonoro de cada bioma del Nether, sintetizado (nada grabado),
// con la estructura de BiomeAmbientSoundsHandler de Java:
// - Bucle: cada bioma tiene el suyo; al cambiar de bioma, el viejo se apaga y el nuevo se enciende en 2 s
//   (40 ticks). Desiertos: retumbe grave con gemidos lejanos; bosque carmesí: un zumbido cálido y orgánico
//   que respira; bosque distorsionado: tonos altos y fríos que silban; valle de almas: viento de almas que
//   aúlla y susurra; deltas de basalto: retumbe hondo y un crepitar continuo.
// - «Additions»: sonidos sueltos de cada bioma (0,0111 por tick, lo decide quien llama).
// - «Mood»: un sonido más largo y dramático cuando el jugador lleva mucho rato a oscuras.
import type { NoiseBuffers } from './noise';
import { noiseSource } from './noise';
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import { createPanner } from './spatial';
import { randRange, type Vec3 } from './types';
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from '../../shared/world/biomeIds';

const BIOMES = [BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS];
/** Fundido del bucle al cambiar de bioma (40 ticks). */
const FADE_SECONDS = 2;

interface Loop {
  gain: GainNode;
  /** Parámetros que se mueven despacio para que el bucle no suene fijo. */
  lfo: { param: AudioParam; base: number; depth: number; rate: number; phase: number }[];
  level: number;
}

export class NetherAmbience {
  private readonly loops = new Map<number, Loop>();
  private readonly sources: AudioScheduledSourceNode[] = [];
  private current = -1;
  private time = 0;
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly noise: NoiseBuffers,
    private readonly destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    for (const b of BIOMES) this.loops.set(b, this.buildLoop(b));
  }

  /** Nodo de salida de un bucle (seco y a la reverberación). */
  private out(wet: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.destination);
    const w = this.ctx.createGain();
    w.gain.value = wet;
    g.connect(w).connect(this.reverbSend);
    return g;
  }

  private noiseLayer(buffer: AudioBuffer, type: BiquadFilterType, freq: number, q: number, level: number, to: AudioNode): BiquadFilterNode {
    const src = noiseSource(this.ctx, buffer, true);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = level;
    src.connect(f).connect(g).connect(to);
    src.start();
    this.sources.push(src);
    return f;
  }

  private tone(freq: number, type: OscillatorType, level: number, to: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(to);
    o.start();
    this.sources.push(o);
    return o;
  }

  private buildLoop(biome: number): Loop {
    const n = this.noise;
    const lfo: Loop['lfo'] = [];
    const add = (param: AudioParam, base: number, depth: number, rate: number) => lfo.push({ param, base, depth, rate, phase: Math.random() * 6.28 });
    let gain: GainNode;
    switch (biome) {
      case BIOME_CRIMSON_FOREST: {
        // Zumbido cálido y orgánico que «respira» y un rumor de esporas.
        gain = this.out(0.45);
        const hum = this.ctx.createBiquadFilter();
        hum.type = 'lowpass';
        hum.frequency.value = 260;
        hum.connect(gain);
        this.tone(73, 'sawtooth', 0.05, hum);
        this.tone(110.5, 'triangle', 0.04, hum);
        add(hum.frequency, 260, 90, 0.07);
        const air = this.noiseLayer(n.pink, 'bandpass', 520, 0.8, 0.22, gain);
        add(air.frequency, 520, 160, 0.05);
        break;
      }
      case BIOME_WARPED_FOREST: {
        // Tonos altos y fríos, como un silbido lejano, sobre un soplo grave.
        gain = this.out(0.7);
        const hi = this.ctx.createBiquadFilter();
        hi.type = 'bandpass';
        hi.frequency.value = 1400;
        hi.Q.value = 6;
        hi.connect(gain);
        const a = this.tone(880, 'sine', 0.018, hi), b = this.tone(1318, 'sine', 0.012, hi);
        add(a.frequency, 880, 12, 0.09);
        add(b.frequency, 1318, 20, 0.06);
        add(hi.frequency, 1400, 500, 0.04);
        const low = this.noiseLayer(n.brown, 'lowpass', 180, 0.7, 0.35, gain);
        add(low.frequency, 180, 60, 0.03);
        break;
      }
      case BIOME_SOUL_SAND_VALLEY: {
        // Viento de almas: ruido que aúlla (filtro estrecho que sube y baja) y susurros.
        gain = this.out(0.8);
        const howl = this.noiseLayer(n.white, 'bandpass', 600, 9, 0.32, gain);
        add(howl.frequency, 600, 280, 0.11);
        const whisper = this.noiseLayer(n.pink, 'highpass', 2600, 0.6, 0.06, gain);
        add(whisper.frequency, 2600, 800, 0.2);
        const low = this.noiseLayer(n.brown, 'lowpass', 140, 0.6, 0.35, gain);
        add(low.frequency, 140, 40, 0.05);
        break;
      }
      case BIOME_BASALT_DELTAS: {
        // Retumbe hondo y un crepitar continuo (ruido blanco muy filtrado que chisporrotea).
        gain = this.out(0.35);
        const rumble = this.noiseLayer(n.brown, 'lowpass', 90, 0.9, 0.55, gain);
        add(rumble.frequency, 90, 30, 0.04);
        const crackle = this.noiseLayer(n.white, 'highpass', 3800, 0.5, 0.05, gain);
        add(crackle.frequency, 3800, 900, 0.3);
        this.tone(41, 'sine', 0.08, gain);
        break;
      }
      default: {
        // Desiertos del Nether: retumbe grave con un tono que gime muy despacio.
        gain = this.out(0.5);
        const rumble = this.noiseLayer(n.brown, 'lowpass', 120, 0.8, 0.45, gain);
        add(rumble.frequency, 120, 40, 0.05);
        const moanF = this.ctx.createBiquadFilter();
        moanF.type = 'lowpass';
        moanF.frequency.value = 400;
        moanF.connect(gain);
        const moan = this.tone(98, 'triangle', 0.035, moanF);
        add(moan.frequency, 98, 9, 0.03);
        break;
      }
    }
    return { gain, lfo, level: 0 };
  }

  /** Bioma del Nether en el que está el jugador (−1 fuera del Nether): funde los bucles. */
  update(dt: number, biome: number): void {
    if (this.disposed) return;
    this.time += dt;
    if (biome !== this.current) this.current = biome;
    const now = this.ctx.currentTime;
    for (const [b, loop] of this.loops) {
      const target = b === this.current ? 1 : 0;
      const step = dt / FADE_SECONDS;
      loop.level = target > loop.level ? Math.min(target, loop.level + step) : Math.max(target, loop.level - step);
      loop.gain.gain.setTargetAtTime(loop.level * 0.5, now, 0.1);
      if (loop.level <= 0) continue;
      for (const l of loop.lfo) l.param.setTargetAtTime(l.base + l.depth * Math.sin(this.time * l.rate * 6.28 + l.phase), now, 0.5);
    }
  }

  private spawnAt(pos: Vec3, wet: number, build: (dest: AudioNode, now: number) => AudioScheduledSourceNode[]): void {
    const panner = createPanner(this.ctx, pos);
    panner.connect(this.destination);
    const w = this.ctx.createGain();
    w.gain.value = wet;
    panner.connect(w).connect(this.reverbSend);
    const srcs = build(panner, this.ctx.currentTime);
    const last = srcs[srcs.length - 1];
    last?.addEventListener('ended', () => {
      try {
        panner.disconnect();
        w.disconnect();
      } catch {
        /* ya desconectado */
      }
    }, { once: true });
  }

  /** Un sonido suelto del bioma («additions») en `pos`. */
  playAddition(biome: number, pos: Vec3): void {
    if (this.disposed) return;
    const n = this.noise;
    this.spawnAt(pos, 0.8, (d, now) => {
      const out: AudioScheduledSourceNode[] = [];
      switch (biome) {
        case BIOME_CRIMSON_FOREST:
          // Algo blando que cae y un chasquido húmedo.
          out.push(playPitchSweep(this.ctx, { destination: d, now, freqStart: randRange(160, 240), freqEnd: randRange(60, 90), attack: 0.01, decay: 0.4, gain: 0.35 }));
          out.push(playNoiseBurst(this.ctx, { buffer: n.brown, destination: d, now: now + 0.05, filterType: 'lowpass', freq: 700, attack: 0.01, decay: 0.3, gain: 0.3 }));
          break;
        case BIOME_WARPED_FOREST:
          // Campanillas frías que se deshacen.
          for (let i = 0; i < 3; i++) {
            out.push(playTonalBlip(this.ctx, { destination: d, now: now + i * randRange(0.15, 0.35), freq: randRange(1200, 2400), wave: 'sine', attack: 0.02, decay: randRange(0.8, 1.6), gain: 0.08 }));
          }
          break;
        case BIOME_SOUL_SAND_VALLEY:
          // Un lamento: tono que sube y baja, con aire.
          out.push(playPitchSweep(this.ctx, { destination: d, now, freqStart: randRange(300, 380), freqEnd: randRange(180, 240), wave: 'triangle', attack: 0.4, decay: 1.8, gain: 0.12 }));
          out.push(playNoiseBurst(this.ctx, { buffer: n.pink, destination: d, now, filterType: 'bandpass', freq: 900, freqEnd: 500, q: 4, attack: 0.3, decay: 1.6, gain: 0.18 }));
          break;
        case BIOME_BASALT_DELTAS:
          // Burbujeo y siseo de la lava, y un crujido de roca.
          for (let i = 0; i < 4; i++) {
            out.push(playPitchSweep(this.ctx, { destination: d, now: now + i * randRange(0.05, 0.2), freqStart: randRange(90, 160), freqEnd: randRange(40, 70), attack: 0.005, decay: 0.2, gain: 0.25 }));
          }
          out.push(playNoiseBurst(this.ctx, { buffer: n.white, destination: d, now, filterType: 'highpass', freq: 3000, attack: 0.02, decay: 0.8, gain: 0.12 }));
          break;
        default:
          // Gemido lejano grave.
          out.push(playPitchSweep(this.ctx, { destination: d, now, freqStart: randRange(90, 130), freqEnd: randRange(60, 80), wave: 'sawtooth', attack: 0.5, decay: 2.2, gain: 0.06 }));
          out.push(playNoiseBurst(this.ctx, { buffer: n.brown, destination: d, now, filterType: 'lowpass', freq: 300, attack: 0.4, decay: 2, gain: 0.25 }));
      }
      return out;
    });
  }

  /** «Mood» del bioma en `pos`: un sonido largo y oscuro tras mucho rato a oscuras. */
  playMood(biome: number, pos: Vec3): void {
    if (this.disposed) return;
    const n = this.noise;
    this.spawnAt(pos, 1, (d, now) => {
      const base = biome === BIOME_WARPED_FOREST ? 220 : biome === BIOME_SOUL_SAND_VALLEY ? 150 : biome === BIOME_CRIMSON_FOREST ? 110 : 65;
      return [
        playPitchSweep(this.ctx, { destination: d, now, freqStart: base * 1.5, freqEnd: base, wave: 'sawtooth', attack: 1.2, decay: 4, gain: 0.07 }),
        playPitchSweep(this.ctx, { destination: d, now: now + 0.3, freqStart: base * 1.02, freqEnd: base * 0.75, wave: 'triangle', attack: 1.5, decay: 4.5, gain: 0.08 }),
        playNoiseBurst(this.ctx, { buffer: n.brown, destination: d, now, filterType: 'lowpass', freq: 250, freqEnd: 120, attack: 1, decay: 5, gain: 0.3 }),
      ];
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const s of this.sources.splice(0)) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* ya detenido */
      }
    }
    for (const l of this.loops.values()) l.gain.disconnect();
  }
}
