// Fase 7.5 (océano): sonidos sintetizados del guardián y del guardián anciano.
// - Voces: un gemido ondulante y hueco (más grave y lento el anciano), un chillido corto al recibir un
//   golpe y un lamento que se apaga al morir; fuera del agua, coletazos húmedos.
// - Láser: un zumbido que sube de tono y de volumen mientras carga (tanto como dura la carga).
// - Púas: un pinchazo seco. Maldición del anciano: un lamento fantasmal de tres voces que baja.
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';
import { LASER_CHARGE, MOB_GUARDIAN } from '../../shared/oceanMobs';

type Sources = AudioScheduledSourceNode[];

/** Gemido ondulante: dos osciladores algo desafinados con el tono que sube y baja. */
function moan(ctx: AudioContext, dest: AudioNode, now: number, f: number, dur: number, gain: number, end = f * 0.8): Sources {
  return [
    playTonalBlip(ctx, { destination: dest, now, freq: f, freqEnd: end, wave: 'triangle', attack: dur * 0.4, decay: dur * 0.6, gain }),
    playTonalBlip(ctx, { destination: dest, now: now + 0.03, freq: f * 1.5, freqEnd: end * 1.47, wave: 'sine', attack: dur * 0.5, decay: dur * 0.5, gain: gain * 0.5, detune: 14 }),
  ];
}

/** Coletazo húmedo contra el suelo. */
function flop(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, big: boolean): Sources {
  return [
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: big ? 380 : 700, q: 1.2, attack: 0.003, decay: 0.12, gain: 0.35 }),
    playPitchSweep(ctx, { destination: dest, now, freqStart: big ? 160 : 260, freqEnd: big ? 70 : 120, attack: 0.004, decay: 0.1, gain: 0.18 }),
  ];
}

/** Voz de un guardián (`kind`: 'guardian' o 'elder_guardian'); vacío si no es uno de ellos. */
export function buildGuardianSound(ctx: AudioContext, noise: NoiseBuffers, kind: string, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (kind !== 'guardian' && kind !== 'elder_guardian') return [];
  const elder = kind === 'elder_guardian';
  const base = (elder ? randRange(150, 190) : randRange(260, 330));
  switch (event) {
    case 'idle':
      return moan(ctx, dest, now, base, elder ? randRange(1.4, 1.9) : randRange(0.8, 1.2), 0.1, base * randRange(0.7, 1.15));
    case 'hurt':
      return [
        playPitchSweep(ctx, { destination: dest, now, freqStart: base * 2.6, freqEnd: base * 1.6, attack: 0.01, decay: 0.2, gain: 0.2, wave: 'sawtooth' }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1800, q: 2, attack: 0.004, decay: 0.12, gain: 0.08 }),
      ];
    case 'death':
      return moan(ctx, dest, now, base * 1.8, elder ? 1.6 : 1, 0.2, base * 0.5);
    case 'step':
      return [];
    case 'attack':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1200, freqEnd: 300, q: 1.5, attack: 0.01, decay: 0.3, gain: 0.25 })];
    default:
      return moan(ctx, dest, now, base, 0.8, 0.1);
  }
}

/** Efectos del océano: láser que carga, coletazo, púas y maldición del anciano (`a`: tipo de criatura). */
export function buildOceanSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number, a = MOB_GUARDIAN): Sources {
  switch (kind) {
    case 'guardian_laser': {
      const dur = LASER_CHARGE[a] ?? 4;
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 900, wave: 'sawtooth', attack: dur, decay: 0.25, gain: 0.08 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 362, freqEnd: 1810, wave: 'sine', attack: dur, decay: 0.3, gain: 0.07, detune: 9 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 600, freqEnd: 4000, q: 4, attack: dur, decay: 0.2, gain: 0.05 }),
      ];
    }
    case 'guardian_flop':
      return flop(ctx, noise, dest, now, a !== MOB_GUARDIAN);
    case 'guardian_thorns':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3200, q: 1, attack: 0.001, decay: 0.05, gain: 0.3 }),
        playPitchSweep(ctx, { destination: dest, now, freqStart: 2400, freqEnd: 1400, attack: 0.002, decay: 0.06, gain: 0.12, wave: 'square' }),
      ];
    case 'elder_curse': {
      // Tres voces que bajan en un acorde disonante, con un soplo de fondo.
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 900, freqEnd: 250, q: 2, attack: 0.4, decay: 1.8, gain: 0.12 }),
      ];
      for (const [f, d] of [[440, 0], [466, 0.08], [330, 0.16]] as const) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + d, freq: f, freqEnd: f * 0.5, wave: 'triangle', attack: 0.35, decay: 1.9, gain: 0.12, detune: 12 }));
      }
      return out;
    }
    default:
      return [];
  }
}
