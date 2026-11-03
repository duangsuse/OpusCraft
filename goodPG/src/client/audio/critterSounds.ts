// Fase 7.5 (fauna): voces de las criaturas sueltas (murciélago, ocelote y caballos esqueleto y zombi),
// con las mismas primitivas que wildlife.ts. La champiñaca muge como la vaca (MobDef.sound).
import { playNoiseBurst, playPitchSweep } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent, type MobSoundKind } from './types';
import { voice, step, series } from './wildlife';

type Sources = AudioScheduledSourceNode[];

// --- Murciélago: chillidos muy agudos y cortos; aleteo al despegar ('attack'). ---
function bat(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const squeak = (t: number, f: number, dur: number, g: number) =>
    [playPitchSweep(ctx, { destination: d, now: t, freqStart: f, freqEnd: f * randRange(1.1, 1.35), attack: 0.004, decay: dur, gain: g, wave: 'triangle' })];
  switch (ev) {
    case 'idle':
      return series(1 + Math.floor(Math.random() * 3), 0.05, 0.11, now, (t) => squeak(t, randRange(3200, 4200), randRange(0.03, 0.06), 0.1));
    case 'hurt':
      return squeak(now, randRange(2600, 3000), 0.12, 0.2);
    case 'death':
      return [playPitchSweep(ctx, { destination: d, now, freqStart: 3600, freqEnd: 1400, attack: 0.005, decay: 0.35, gain: 0.2, wave: 'triangle' })];
    case 'attack':
      // Aleteo: ráfagas de ruido rápidas.
      return series(4, 0.035, 0.05, now, (t) =>
        [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: randRange(900, 1400), q: 1.2, attack: 0.003, decay: 0.03, gain: 0.12 })]);
    case 'step':
      return [];
    default:
      return squeak(now, 3600, 0.05, 0.1);
  }
}

// --- Ocelote: maullido corto y bufido de gato al asustarse o recibir un golpe. ---
function ocelot(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const meow = (f: number, dur: number, g: number) =>
    voice(ctx, d, now, { freq: f, freqEnd: f * 0.75, dur, gain: g, vibratoRate: 7, vibratoDepth: 0.03, formant: f * 2.5, q: 4, attack: 0.04 });
  switch (ev) {
    case 'idle':
      return meow(randRange(520, 640), randRange(0.25, 0.4), 0.2);
    case 'hurt':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'highpass', freq: 2500, q: 0.8, attack: 0.01, decay: 0.2, gain: 0.22 }), ...meow(760, 0.12, 0.22)];
    case 'death':
      return meow(620, 0.6, 0.24);
    case 'attack':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'highpass', freq: 3000, q: 0.7, attack: 0.02, decay: 0.3, gain: 0.2 })];
    case 'step':
      return step(ctx, noise, d, now, 0.05);
    default:
      return meow(580, 0.3, 0.18);
  }
}

// --- Caballo esqueleto: relincho hueco y agudo con traqueteo de huesos. ---
function skeletonHorse(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const rattle = (n: number) => series(n, 0.03, 0.06, now, (t) =>
    [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: t, filterType: 'bandpass', freq: randRange(1800, 2600), q: 4, attack: 0.001, decay: 0.025, gain: 0.1 })]);
  const neigh = (f: number, dur: number, g: number) =>
    voice(ctx, d, now, { freq: f, freqEnd: f * 0.6, dur, gain: g, vibratoRate: 22, vibratoDepth: 0.1, formant: f * 1.6, q: 7, wave: 'triangle', attack: 0.05 });
  switch (ev) {
    case 'idle':
      return [...neigh(randRange(520, 640), randRange(0.5, 0.8), 0.18), ...rattle(3)];
    case 'hurt':
      return [...neigh(700, 0.2, 0.24), ...rattle(4)];
    case 'death':
      return [...neigh(620, 1, 0.24), ...rattle(8)];
    case 'step':
      return [...step(ctx, noise, d, now, 0.5), ...rattle(1)];
    default:
      return rattle(3);
  }
}

// --- Caballo zombi: relincho grave y ronco, como un gemido. ---
function zombieHorse(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const groan = (f: number, dur: number, g: number) => [
    ...voice(ctx, d, now, { freq: f, freqEnd: f * 0.7, dur, gain: g, vibratoRate: 9, vibratoDepth: 0.14, formant: f * 3, q: 2.5, attack: 0.08 }),
    playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now, filterType: 'bandpass', freq: randRange(350, 500), q: 1.5, attack: 0.08, decay: dur, gain: g * 0.6 }),
  ];
  switch (ev) {
    case 'idle':
      return groan(randRange(170, 220), randRange(0.7, 1), 0.24);
    case 'hurt':
      return groan(260, 0.3, 0.3);
    case 'death':
      return groan(200, 1.3, 0.3);
    case 'step':
      return step(ctx, noise, d, now, 0.8);
    default:
      return groan(190, 0.5, 0.2);
  }
}

/** Voz de una criatura nueva (lista vacía si el tipo no es de los suyos). */
export function buildCritterSound(ctx: AudioContext, noise: NoiseBuffers, kind: MobSoundKind, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (kind) {
    case 'bat': return bat(ctx, noise, ev, d, now);
    case 'ocelot': return ocelot(ctx, noise, ev, d, now);
    case 'skeleton_horse': return skeletonHorse(ctx, noise, ev, d, now);
    case 'zombie_horse': return zombieHorse(ctx, noise, ev, d, now);
    default: return [];
  }
}
