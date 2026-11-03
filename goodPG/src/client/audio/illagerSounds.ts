// Fase 6 (asaltos): voces sintetizadas de los illagers, el vex y el devastador, y los efectos de los
// asaltos (cuerno, ballesta, conjuros, colmillos, rugido, tótem, victoria y derrota).
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';

type Sources = AudioScheduledSourceNode[];

/** Illager: gruñido nasal y desconfiado («hrmm»), más grave que el del aldeano. */
function illagerVoice(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (event === 'step') {
    return [playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: randRange(420, 620), q: 0.8, attack: 0.002, decay: 0.07, gain: 0.14 })];
  }
  const f = randRange(150, 190);
  const long = event === 'death' ? 0.7 : event === 'hurt' ? 0.18 : 0.32;
  const out: Sources = [
    playPitchSweep(ctx, { destination: dest, now, freqStart: event === 'hurt' ? f * 1.8 : f * 1.15, freqEnd: event === 'death' ? f * 0.55 : f * 0.85, attack: 0.02, decay: long, gain: 0.16, wave: 'sawtooth' }),
    playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 700, q: 4, attack: 0.02, decay: long * 0.8, gain: 0.05 }),
  ];
  if (event === 'idle' && Math.random() < 0.5) {
    out.push(playPitchSweep(ctx, { destination: dest, now: now + long + 0.06, freqStart: f * 0.95, freqEnd: f * 0.8, attack: 0.02, decay: 0.2, gain: 0.12, wave: 'sawtooth' }));
  }
  return out;
}

/** Vex: chillido agudo y susurrante. */
function vexVoice(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (event === 'step') return [];
  const f = randRange(1300, 1700);
  const long = event === 'death' ? 0.5 : 0.22;
  return [
    playPitchSweep(ctx, { destination: dest, now, freqStart: f, freqEnd: event === 'death' ? f * 0.4 : f * 1.25, attack: 0.01, decay: long, gain: 0.07, wave: 'triangle' }),
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3500, q: 0.7, attack: 0.01, decay: long, gain: 0.05 }),
  ];
}

/** Devastador: bufido grave; al morir, un rugido largo que se apaga. */
function ravagerVoice(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (event === 'step') {
    return [
      playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 220, q: 1, attack: 0.004, decay: 0.2, gain: 0.3 }),
      playTonalBlip(ctx, { destination: dest, now, freq: 55, freqEnd: 40, wave: 'sine', attack: 0.004, decay: 0.18, gain: 0.25 }),
    ];
  }
  const long = event === 'death' ? 1.2 : event === 'hurt' ? 0.3 : 0.55;
  return [
    playPitchSweep(ctx, { destination: dest, now, freqStart: randRange(95, 120), freqEnd: event === 'death' ? 45 : 70, attack: 0.03, decay: long, gain: 0.22, wave: 'sawtooth' }),
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 600, freqEnd: 250, q: 1.5, attack: 0.03, decay: long, gain: 0.25 }),
  ];
}

/** Voz de una criatura de los asaltos por su clave de sonido (vacío si no es una de éstas). */
export function buildIllagerSound(ctx: AudioContext, noise: NoiseBuffers, kind: string, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'illager':
      return illagerVoice(ctx, noise, event, dest, now);
    case 'vex':
      return vexVoice(ctx, noise, event, dest, now);
    case 'ravager':
      return ravagerVoice(ctx, noise, event, dest, now);
    default:
      return [];
  }
}

/** Efectos de los asaltos. */
export function buildRaidSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'raid_horn': {
      // Cuerno de guerra: dos notas graves y largas con aliento.
      const out: Sources = [];
      for (const [f, t] of [[98, 0], [92, 1.4]] as const) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + t, freq: f, freqEnd: f * 0.97, wave: 'sawtooth', attack: 0.25, decay: 1.6, gain: 0.22 }));
        out.push(playTonalBlip(ctx, { destination: dest, now: now + t, freq: f * 1.5, freqEnd: f * 1.46, wave: 'sawtooth', attack: 0.3, decay: 1.5, gain: 0.1 }));
        out.push(playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + t, filterType: 'bandpass', freq: 500, q: 2, attack: 0.3, decay: 1.4, gain: 0.06 }));
      }
      return out;
    }
    case 'crossbow_shoot':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2200, q: 3, attack: 0.001, decay: 0.05, gain: 0.2 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 260, freqEnd: 140, wave: 'triangle', attack: 0.001, decay: 0.14, gain: 0.22 }),
      ];
    case 'evoker_cast': {
      // Conjuro: brillo que sube, con un zumbido.
      const out: Sources = [playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1200, freqEnd: 4200, q: 6, attack: 0.1, decay: 0.8, gain: 0.08 })];
      for (let i = 0; i < 5; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + i * 0.07, freq: 520 * (1 + i * 0.25), wave: 'sine', attack: 0.01, decay: 0.25, gain: 0.05 }));
      }
      return out;
    }
    case 'fangs_bite':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1800, q: 2, attack: 0.001, decay: 0.06, gain: 0.22 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 320, freqEnd: 180, wave: 'square', attack: 0.001, decay: 0.07, gain: 0.08 }),
      ];
    case 'ravager_roar':
      return [
        playPitchSweep(ctx, { destination: dest, now, freqStart: 140, freqEnd: 60, attack: 0.08, decay: 1.4, gain: 0.3, wave: 'sawtooth' }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 900, freqEnd: 200, q: 2, attack: 0.08, decay: 1.4, gain: 0.35 }),
      ];
    case 'totem': {
      // Tótem: campanilla brillante que sube.
      const out: Sources = [];
      for (let i = 0; i < 6; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + i * 0.06, freq: 660 * Math.pow(1.26, i), wave: 'sine', attack: 0.005, decay: 0.5, gain: 0.08 }));
      }
      return out;
    }
    case 'raid_win': {
      const out: Sources = [];
      [392, 494, 587, 784].forEach((f, i) => out.push(playTonalBlip(ctx, { destination: dest, now: now + i * 0.16, freq: f, wave: 'triangle', attack: 0.01, decay: 0.6, gain: 0.12 })));
      return out;
    }
    case 'raid_lose':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 196, freqEnd: 180, wave: 'sawtooth', attack: 0.05, decay: 1.2, gain: 0.14 }),
        playTonalBlip(ctx, { destination: dest, now: now + 0.5, freq: 147, freqEnd: 130, wave: 'sawtooth', attack: 0.05, decay: 1.6, gain: 0.14 }),
      ];
    default:
      return [];
  }
}
