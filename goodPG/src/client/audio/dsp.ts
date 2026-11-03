// Primitivas de síntesis reutilizables: envolventes, ráfagas de ruido filtrado, "blips" tonales,
// anillos inarmónicos (metal) y barridos de tono (burbujas). Todo esto compone los timbres de
// materiales, ambientación y música a partir de los buffers de ruido pre-generados.
import { noiseOffset, noiseSource } from './noise';

/** Programa una envolvente de amplitud: ataque exponencial rápido y caída exponencial. */
export function scheduleEnvelope(
  param: AudioParam,
  now: number,
  attack: number,
  peak: number,
  decay: number,
  floor = 0.0001,
): void {
  const a = Math.max(attack, 0.001);
  const d = Math.max(decay, 0.001);
  param.cancelScheduledValues(now);
  param.setValueAtTime(floor, now);
  param.exponentialRampToValueAtTime(Math.max(peak, floor), now + a);
  param.exponentialRampToValueAtTime(floor, now + a + d);
}

export interface NoiseBurstOptions {
  buffer: AudioBuffer;
  destination: AudioNode;
  now: number;
  filterType: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  attack: number;
  decay: number;
  gain: number;
  playbackRate?: number;
}

/** Ruido filtrado con envolvente de amplitud: base de crujidos, golpes secos, siseos, etc. */
export function playNoiseBurst(ctx: AudioContext, opts: NoiseBurstOptions): AudioBufferSourceNode {
  const src = noiseSource(ctx, opts.buffer);
  src.playbackRate.value = opts.playbackRate ?? 1;

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType;
  filter.Q.value = opts.q ?? 0.7;
  filter.frequency.setValueAtTime(Math.max(opts.freq, 20), opts.now);
  if (opts.freqEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 20), opts.now + opts.attack + opts.decay);
  }

  const gain = ctx.createGain();
  scheduleEnvelope(gain.gain, opts.now, opts.attack, opts.gain, opts.decay);

  src.connect(filter).connect(gain).connect(opts.destination);

  const dur = opts.attack + opts.decay + 0.15;
  const offset = noiseOffset(opts.buffer, dur);
  src.start(opts.now, offset, dur);
  src.stop(opts.now + dur + 0.05);
  src.addEventListener(
    'ended',
    () => {
      try {
        filter.disconnect();
        gain.disconnect();
      } catch {
        /* ya desconectado */
      }
    },
    { once: true },
  );
  return src;
}

export interface BlipOptions {
  destination: AudioNode;
  now: number;
  freq: number;
  freqEnd?: number;
  wave?: OscillatorType;
  attack: number;
  decay: number;
  gain: number;
  detune?: number;
}

/** Tono corto con caída exponencial: clics, "knocks", "tinks", golpes de percusión afinada. */
export function playTonalBlip(ctx: AudioContext, opts: BlipOptions): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = opts.wave ?? 'sine';
  osc.frequency.setValueAtTime(Math.max(opts.freq, 1), opts.now);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 1), opts.now + opts.attack + opts.decay);
  }
  if (opts.detune) osc.detune.value = opts.detune;

  const gain = ctx.createGain();
  scheduleEnvelope(gain.gain, opts.now, opts.attack, opts.gain, opts.decay);
  osc.connect(gain).connect(opts.destination);

  const dur = opts.attack + opts.decay + 0.1;
  osc.start(opts.now);
  osc.stop(opts.now + dur);
  osc.addEventListener(
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
  return osc;
}

export interface RingOptions {
  destination: AudioNode;
  now: number;
  baseFreq: number;
  partials: readonly number[];
  decay: number;
  gain: number;
}

/** Varios parciales sinusoidales inarmónicos decayendo a distinto ritmo: timbre metálico. */
export function playInharmonicRing(ctx: AudioContext, opts: RingOptions): OscillatorNode[] {
  const oscs: OscillatorNode[] = [];
  opts.partials.forEach((mult, i) => {
    const partialGain = opts.gain * Math.pow(0.62, i);
    const partialDecay = Math.max(0.08, opts.decay * (1 - i * 0.12));
    const osc = playTonalBlip(ctx, {
      destination: opts.destination,
      now: opts.now,
      freq: opts.baseFreq * mult,
      wave: 'sine',
      attack: 0.002,
      decay: partialDecay,
      gain: partialGain,
    });
    oscs.push(osc);
  });
  return oscs;
}

export interface PitchSweepOptions {
  destination: AudioNode;
  now: number;
  freqStart: number;
  freqEnd: number;
  attack: number;
  decay: number;
  gain: number;
  wave?: OscillatorType;
}

/** Barrido de frecuencia (sube o baja): burbujas, "pops" de agua/lava. */
export function playPitchSweep(ctx: AudioContext, opts: PitchSweepOptions): OscillatorNode {
  return playTonalBlip(ctx, {
    destination: opts.destination,
    now: opts.now,
    freq: opts.freqStart,
    freqEnd: opts.freqEnd,
    wave: opts.wave ?? 'sine',
    attack: opts.attack,
    decay: opts.decay,
    gain: opts.gain,
  });
}
