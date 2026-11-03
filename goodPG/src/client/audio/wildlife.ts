// Voces de la fauna de la fase 6 (zorro, cabra, oso polar, conejo, lobo, abeja, panda, loro y
// armadillo): síntesis procedural con las mismas primitivas que creatures.ts, aleatorizada en tono y
// tiempo. En cada lista de fuentes la última es la que más dura (cierra la voz).
import { playNoiseBurst, playPitchSweep, playTonalBlip, scheduleEnvelope } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent, type MobSoundKind } from './types';

type Sources = AudioScheduledSourceNode[];

interface VoiceOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  gain: number;
  vibratoRate: number;
  vibratoDepth: number;
  formant: number;
  q: number;
  wave?: OscillatorType;
  attack?: number;
}

/** Voz con vibrato y formante (oscilador → paso banda → envolvente). */
export function voice(ctx: AudioContext, dest: AudioNode, now: number, o: VoiceOpts): Sources {
  const attack = o.attack ?? 0.03;
  const osc = ctx.createOscillator();
  osc.type = o.wave ?? 'sawtooth';
  osc.frequency.setValueAtTime(Math.max(1, o.freq), now);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), now + attack + o.dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = o.vibratoRate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = o.freq * o.vibratoDepth;
  lfo.connect(lfoGain).connect(osc.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = o.formant;
  bp.Q.value = o.q;
  const amp = ctx.createGain();
  scheduleEnvelope(amp.gain, now, attack, o.gain, o.dur);
  osc.connect(bp).connect(amp).connect(dest);
  const stop = now + attack + o.dur + 0.12;
  osc.start(now);
  lfo.start(now);
  osc.stop(stop);
  lfo.stop(stop);
  osc.addEventListener('ended', () => {
    try {
      lfo.disconnect();
      lfoGain.disconnect();
      bp.disconnect();
      amp.disconnect();
    } catch {
      /* ya desconectado */
    }
  }, { once: true });
  return [lfo, osc];
}

/** Paso: golpe de ruido grave, más pesado cuanto mayor es `weight` (0..1). */
export function step(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, weight: number): Sources {
  const w = Math.max(0, Math.min(1, weight));
  const out: Sources = [];
  if (w > 0.5) out.push(playTonalBlip(ctx, { destination: dest, now, freq: randRange(50, 80), wave: 'sine', attack: 0.002, decay: 0.08 + 0.06 * w, gain: 0.2 * w }));
  out.push(playNoiseBurst(ctx, {
    buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: randRange(700, 1000) - 500 * w, q: 0.7,
    attack: 0.002, decay: 0.05 + 0.09 * w, gain: (0.1 + 0.25 * w) * randRange(0.85, 1.15),
  }));
  return out;
}

/** Varios sonidos seguidos (ladridos, píos): `make(t, i)` da las fuentes de cada uno. */
export function series(n: number, gapMin: number, gapMax: number, now: number, make: (t: number, i: number) => Sources): Sources {
  const out: Sources = [];
  let t = now;
  for (let i = 0; i < n; i++) {
    out.push(...make(t, i));
    t += randRange(gapMin, gapMax);
  }
  return out;
}

// --- Zorro: chillidos agudos y cortos ("yips"). ---
function fox(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const yip = (t: number, f: number, dur: number, g: number) =>
    voice(ctx, d, t, { freq: f, freqEnd: f * 0.7, dur, gain: g, vibratoRate: 18, vibratoDepth: 0.04, formant: f * 2.2, q: 3, attack: 0.01 });
  switch (ev) {
    case 'idle':
      return series(1 + Math.floor(Math.random() * 3), 0.12, 0.2, now, (t) => yip(t, randRange(650, 900), randRange(0.06, 0.1), 0.22));
    case 'hurt':
      return yip(now, randRange(900, 1100), 0.12, 0.3);
    case 'death':
      return voice(ctx, d, now, { freq: randRange(900, 1000), freqEnd: randRange(260, 340), dur: 0.5, gain: 0.3, vibratoRate: 14, vibratoDepth: 0.05, formant: 1800, q: 2.5 });
    case 'step':
      return step(ctx, noise, d, now, 0.15);
    default:
      return yip(now, 800, 0.08, 0.2);
  }
}

// --- Cabra: balido áspero, más grave que el de la oveja, y pezuñas. ---
function goat(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const bleat = (f: number, dur: number, g: number, end?: number) =>
    voice(ctx, d, now, { freq: f, freqEnd: end, dur, gain: g, vibratoRate: randRange(11, 14), vibratoDepth: 0.08, formant: f * 2.8, q: 3.5, attack: 0.03 });
  switch (ev) {
    case 'idle':
      return bleat(randRange(210, 270), randRange(0.35, 0.6), 0.3);
    case 'hurt':
      return bleat(randRange(300, 360), randRange(0.15, 0.22), 0.34);
    case 'death':
      return bleat(randRange(280, 320), 0.7, 0.32, randRange(120, 150));
    case 'step':
      return [playTonalBlip(ctx, { destination: d, now, freq: randRange(900, 1300), wave: 'square', attack: 0.001, decay: 0.02, gain: 0.05 }), ...step(ctx, noise, d, now, 0.4)];
    default:
      return bleat(240, 0.3, 0.24);
  }
}

// --- Oso polar: gruñidos graves y rugidos. ---
function growl(ctx: AudioContext, noise: NoiseBuffers, d: AudioNode, now: number, dur: number, gain: number, f0: number, fall: boolean): Sources {
  const rumble = voice(ctx, d, now, { freq: f0, freqEnd: fall ? f0 * 0.6 : undefined, dur, gain: gain * 0.7, vibratoRate: randRange(20, 28), vibratoDepth: 0.12, formant: f0 * 4, q: 1.5, attack: 0.06 });
  const breath = playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now, filterType: 'bandpass', freq: randRange(300, 450), freqEnd: fall ? 180 : undefined, q: 1.2, attack: 0.08, decay: dur + 0.05, gain });
  return [...rumble, breath];
}

function polarBear(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (ev) {
    case 'idle':
      return growl(ctx, noise, d, now, randRange(0.5, 0.9), 0.24, randRange(70, 95), false);
    case 'hurt':
      return growl(ctx, noise, d, now, randRange(0.2, 0.3), 0.34, randRange(110, 140), false);
    case 'death':
      return growl(ctx, noise, d, now, randRange(1, 1.3), 0.32, randRange(100, 120), true);
    case 'attack':
      return growl(ctx, noise, d, now, 0.45, 0.4, randRange(120, 150), true);
    case 'step':
      return step(ctx, noise, d, now, 0.95);
    default:
      return growl(ctx, noise, d, now, 0.4, 0.2, 80, false);
  }
}

// --- Conejo: casi mudo; olisquea y chilla si le hacen daño. ---
function rabbit(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const squeak = (f: number, dur: number, g: number, end: number) =>
    [playPitchSweep(ctx, { destination: d, now, freqStart: f, freqEnd: end, attack: 0.005, decay: dur, gain: g, wave: 'triangle' })];
  switch (ev) {
    case 'idle':
      return series(2 + Math.floor(Math.random() * 2), 0.06, 0.1, now, (t) =>
        [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: t, filterType: 'bandpass', freq: randRange(3000, 4500), q: 3, attack: 0.004, decay: 0.03, gain: 0.07 })]);
    case 'hurt':
      return squeak(randRange(1600, 1900), 0.12, 0.28, randRange(2400, 2800));
    case 'death':
      return squeak(randRange(2200, 2600), 0.35, 0.3, randRange(700, 900));
    case 'step':
      return step(ctx, noise, d, now, 0.12);
    default:
      return squeak(2000, 0.08, 0.2, 2400);
  }
}

// --- Lobo: jadeo, ladridos y gemidos. ---
function wolf(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const bark = (t: number, g: number) => [
    playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: randRange(700, 900), q: 1.5, attack: 0.004, decay: 0.08, gain: g * 0.6 }),
    ...voice(ctx, d, t, { freq: randRange(330, 420), freqEnd: randRange(200, 250), dur: 0.09, gain: g, vibratoRate: 30, vibratoDepth: 0.05, formant: 900, q: 2, attack: 0.008 }),
  ];
  switch (ev) {
    case 'idle':
      if (Math.random() < 0.5) {
        // Jadeo.
        return series(4, 0.16, 0.2, now, (t, i) => [playNoiseBurst(ctx, {
          buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: i & 1 ? 1100 : 1500, q: 1.5, attack: 0.02, decay: 0.08, gain: 0.08,
        })]);
      }
      return series(1 + Math.floor(Math.random() * 2), 0.18, 0.26, now, (t) => bark(t, 0.3));
    case 'hurt':
      return voice(ctx, d, now, { freq: randRange(700, 800), freqEnd: randRange(1000, 1200), dur: 0.15, gain: 0.3, vibratoRate: 9, vibratoDepth: 0.03, formant: 1500, q: 3, wave: 'triangle' });
    case 'death':
      return voice(ctx, d, now, { freq: randRange(800, 900), freqEnd: randRange(250, 320), dur: 0.8, gain: 0.3, vibratoRate: 6, vibratoDepth: 0.05, formant: 1200, q: 2.5, wave: 'triangle' });
    case 'attack':
      return [...bark(now + 0.05, 0.34), ...growl(ctx, noise, d, now, 0.25, 0.2, randRange(140, 170), false)];
    case 'step':
      return step(ctx, noise, d, now, 0.3);
    default:
      return bark(now, 0.26);
  }
}

// --- Abeja: zumbido (diente de sierra con vibrato rápido, filtrado). ---
function buzz(ctx: AudioContext, d: AudioNode, now: number, f: number, dur: number, g: number, end?: number): Sources {
  return voice(ctx, d, now, { freq: f, freqEnd: end, dur, gain: g, vibratoRate: randRange(28, 36), vibratoDepth: 0.03, formant: f * 3, q: 1.2, attack: 0.08 });
}

function bee(ctx: AudioContext, _noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (ev) {
    case 'idle':
      return buzz(ctx, d, now, randRange(190, 230), randRange(0.8, 1.4), 0.12);
    case 'hurt':
      return buzz(ctx, d, now, randRange(300, 340), 0.2, 0.2);
    case 'death':
      return buzz(ctx, d, now, randRange(280, 320), 0.6, 0.18, 90);
    case 'attack':
      return buzz(ctx, d, now, randRange(330, 380), 0.35, 0.24);
    case 'step':
      return []; // vuela: sin pasos
    default:
      return buzz(ctx, d, now, 210, 0.5, 0.1);
  }
}

// --- Panda: resoplidos y balidos nasales; estornudo de vez en cuando. ---
function panda(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const huff = (f: number, dur: number, g: number, end?: number) =>
    voice(ctx, d, now, { freq: f, freqEnd: end, dur, gain: g, vibratoRate: 7, vibratoDepth: 0.05, formant: f * 3.5, q: 2.5, attack: 0.04 });
  switch (ev) {
    case 'idle':
      if (Math.random() < 0.15) {
        // Estornudo.
        return [
          playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'bandpass', freq: 600, freqEnd: 1400, q: 1, attack: 0.25, decay: 0.02, gain: 0.08 }),
          playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: now + 0.28, filterType: 'highpass', freq: 1800, q: 0.6, attack: 0.003, decay: 0.12, gain: 0.3 }),
        ];
      }
      return huff(randRange(140, 180), randRange(0.25, 0.4), 0.26);
    case 'hurt':
      return huff(randRange(220, 260), 0.18, 0.32);
    case 'death':
      return huff(randRange(200, 230), 0.8, 0.3, randRange(90, 110));
    case 'attack':
      return growl(ctx, noise, d, now, 0.35, 0.3, randRange(110, 130), false);
    case 'step':
      return step(ctx, noise, d, now, 0.75);
    default:
      return huff(160, 0.3, 0.2);
  }
}

// --- Loro: silbidos y píos rápidos; graznido al recibir daño. ---
function parrot(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const chirp = (t: number) => {
    const a = randRange(1400, 2600), b = a * randRange(0.7, 1.5);
    return [playPitchSweep(ctx, { destination: d, now: t, freqStart: a, freqEnd: b, attack: 0.01, decay: randRange(0.05, 0.1), gain: 0.16, wave: 'sine' })];
  };
  const squawk = (dur: number, g: number, end: number) => [
    playNoiseBurst(ctx, { buffer: noise.white, destination: d, now, filterType: 'bandpass', freq: 2200, q: 2, attack: 0.004, decay: dur * 0.8, gain: g * 0.5 }),
    ...voice(ctx, d, now, { freq: randRange(900, 1100), freqEnd: end, dur, gain: g, vibratoRate: 40, vibratoDepth: 0.06, formant: 2400, q: 2, attack: 0.005 }),
  ];
  switch (ev) {
    case 'idle':
      return series(2 + Math.floor(Math.random() * 3), 0.07, 0.14, now, (t) => chirp(t));
    case 'hurt':
      return squawk(0.14, 0.3, 1400);
    case 'death':
      return squawk(0.45, 0.3, 400);
    case 'step':
      return [];
    default:
      return chirp(now);
  }
}

// --- Armadillo: olisqueos y chillidos suaves; clac del caparazón al enroscarse ('attack'). ---
function armadillo(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (ev) {
    case 'idle':
      return series(2, 0.08, 0.12, now, (t) =>
        [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: randRange(1800, 2600), q: 2.5, attack: 0.005, decay: 0.04, gain: 0.08 })]);
    case 'hurt':
      return [playPitchSweep(ctx, { destination: d, now, freqStart: randRange(900, 1100), freqEnd: randRange(1400, 1600), attack: 0.005, decay: 0.12, gain: 0.24, wave: 'triangle' })];
    case 'death':
      return [playPitchSweep(ctx, { destination: d, now, freqStart: 1300, freqEnd: 500, attack: 0.01, decay: 0.4, gain: 0.26, wave: 'triangle' })];
    case 'attack':
      return [
        playTonalBlip(ctx, { destination: d, now, freq: randRange(500, 650), wave: 'square', attack: 0.001, decay: 0.04, gain: 0.12 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now, filterType: 'lowpass', freq: 900, q: 0.8, attack: 0.002, decay: 0.12, gain: 0.25 }),
      ];
    case 'step':
      return step(ctx, noise, d, now, 0.2);
    default:
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'bandpass', freq: 2000, q: 2, attack: 0.005, decay: 0.05, gain: 0.08 })];
  }
}

/** Sonido de una criatura de la fauna (lista vacía si el tipo no es de los suyos). */
export function buildWildlifeSound(ctx: AudioContext, noise: NoiseBuffers, kind: MobSoundKind, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (kind) {
    case 'fox': return fox(ctx, noise, ev, d, now);
    case 'goat': return goat(ctx, noise, ev, d, now);
    case 'polar_bear': return polarBear(ctx, noise, ev, d, now);
    case 'rabbit': return rabbit(ctx, noise, ev, d, now);
    case 'wolf': return wolf(ctx, noise, ev, d, now);
    case 'bee': return bee(ctx, noise, ev, d, now);
    case 'panda': return panda(ctx, noise, ev, d, now);
    case 'parrot': return parrot(ctx, noise, ev, d, now);
    case 'armadillo': return armadillo(ctx, noise, ev, d, now);
    default: return [];
  }
}
