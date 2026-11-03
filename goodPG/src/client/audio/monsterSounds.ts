// Fase 6 (monstruos): voces sintetizadas de los monstruos nuevos que no se parecen a ninguno de los
// anteriores (bruja, slime, phantom y lepisma). El ahogado y el aldeano zombi usan la voz del zombi
// y la araña de cueva la de la araña (MobDef.sound).
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';

type Sources = AudioScheduledSourceNode[];

/** Bruja: risita nasal (notas cortas que bajan) y un «¡ah!» al recibir un golpe. */
function witchSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (event === 'step') {
    return [playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: randRange(500, 700), q: 0.7, attack: 0.002, decay: 0.07, gain: 0.14 })];
  }
  if (event === 'hurt' || event === 'death') {
    const long = event === 'death';
    return [
      playPitchSweep(ctx, { destination: dest, now, freqStart: randRange(700, 820), freqEnd: long ? 260 : 480, attack: 0.01, decay: long ? 0.6 : 0.2, gain: 0.2, wave: 'sawtooth' }),
      playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1400, q: 3, attack: 0.005, decay: 0.12, gain: 0.08 }),
    ];
  }
  const out: Sources = [];
  const n = event === 'idle' ? 4 + Math.floor(Math.random() * 3) : 3;
  let f = randRange(900, 1100);
  for (let i = 0; i < n; i++) {
    out.push(playTonalBlip(ctx, { destination: dest, now: now + i * 0.085, freq: f, freqEnd: f * 0.85, wave: 'square', attack: 0.004, decay: 0.06, gain: 0.07 }));
    f *= 0.93;
  }
  return out;
}

/** Slime: chapoteo blando (ruido grave filtrado con un «bloop» que baja). */
function slimeSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  const big = event === 'death' ? 1 : randRange(0.4, 1);
  const f = randRange(140, 220) / big;
  return [
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500 + 300 * (1 - big), q: 2.5, attack: 0.004, decay: event === 'death' ? 0.35 : 0.14, gain: 0.26 }),
    playPitchSweep(ctx, { destination: dest, now, freqStart: f * 1.8, freqEnd: f, attack: 0.005, decay: event === 'hurt' ? 0.12 : 0.18, gain: event === 'step' ? 0.1 : 0.2, wave: 'sine' }),
  ];
}

/** Phantom: chillido agudo y áspero que sube y baja. */
function phantomSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (event === 'step') return [];
  const hi = randRange(1300, 1700);
  const dur = event === 'death' ? 0.7 : event === 'idle' ? 0.45 : 0.25;
  return [
    playPitchSweep(ctx, { destination: dest, now, freqStart: hi * 0.7, freqEnd: hi, attack: 0.02, decay: dur * 0.5, gain: 0.12, wave: 'sawtooth' }),
    playPitchSweep(ctx, { destination: dest, now: now + dur * 0.5, freqStart: hi, freqEnd: hi * (event === 'death' ? 0.3 : 0.6), attack: 0.01, decay: dur * 0.6, gain: 0.1, wave: 'sawtooth' }),
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3000, q: 1, attack: 0.01, decay: dur, gain: 0.05 }),
  ];
}

/** Lepisma: siseo corto y seco (ruido agudo). */
function silverfishSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  const loud = event === 'hurt' || event === 'death' || event === 'attack';
  return [
    playNoiseBurst(ctx, {
      buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: randRange(3500, 5000), q: 1.5, attack: 0.002,
      decay: event === 'step' ? 0.02 : loud ? 0.18 : 0.1, gain: event === 'step' ? 0.05 : loud ? 0.2 : 0.12,
    }),
  ];
}

/** Fase 8.6: endermita: un chirrido de insecto con un zumbido metálico que baja (el eco del End). */
function endermiteSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  const loud = event === 'hurt' || event === 'death' || event === 'attack';
  if (event === 'step') {
    return [playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 4200, q: 1.2, attack: 0.002, decay: 0.02, gain: 0.04 })];
  }
  const out: Sources = [];
  const n = loud ? 3 : 2;
  for (let i = 0; i < n; i++) {
    out.push(playNoiseBurst(ctx, {
      buffer: noise.white, destination: dest, now: now + i * 0.05, filterType: 'bandpass', freq: randRange(2800, 4200), q: 4, attack: 0.002,
      decay: 0.04, gain: loud ? 0.16 : 0.09,
    }));
  }
  out.push(playTonalBlip(ctx, { destination: dest, now, freq: randRange(1500, 1900), freqEnd: event === 'death' ? 300 : 900, wave: 'square', attack: 0.004, decay: loud ? 0.22 : 0.12, gain: 0.03 }));
  return out;
}

/** Voz de un monstruo nuevo por su clave de sonido (vacío si no es uno de éstos). */
export function buildMonsterSound(ctx: AudioContext, noise: NoiseBuffers, kind: string, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'witch':
      return witchSound(ctx, noise, event, dest, now);
    case 'slime':
      return slimeSound(ctx, noise, event, dest, now);
    case 'phantom':
      return phantomSound(ctx, noise, event, dest, now);
    case 'silverfish':
      return silverfishSound(ctx, noise, event, dest, now);
    case 'endermite':
      return endermiteSound(ctx, noise, event, dest, now);
    // Fase 8.6: el shulker: un gorgoteo hueco dentro de la concha; herido, un chillido corto; al morir, se vacía.
    case 'shulker':
      if (event === 'step') return [];
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: event === 'hurt' ? randRange(520, 640) : randRange(260, 330), freqEnd: event === 'death' ? 90 : event === 'hurt' ? 380 : 220, wave: 'triangle', attack: 0.01, decay: event === 'death' ? 0.6 : 0.25, gain: 0.14 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: randRange(700, 900), q: 3, attack: 0.01, decay: event === 'death' ? 0.5 : 0.2, gain: 0.1 }),
      ];
    // Fase 8.6: el dragón (sus rugidos grandes van con los efectos del End; aquí, los golpes que recibe).
    case 'ender_dragon':
      return event === 'hurt' || event === 'death' ? [
        playTonalBlip(ctx, { destination: dest, now, freq: 110, freqEnd: 70, wave: 'sawtooth', attack: 0.05, decay: 0.8, gain: 0.28 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'bandpass', freq: 380, q: 1.1, attack: 0.05, decay: 0.8, gain: 0.3 }),
      ] : [];
    default:
      return [];
  }
}
