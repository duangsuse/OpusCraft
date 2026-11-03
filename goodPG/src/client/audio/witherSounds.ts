// Fase 8.7: los sonidos del Wither, sintetizados aquí (nada copiado del juego).
// - Voz: un gruñido ronco y áspero a tres voces (una por cabeza), que duele al herirle y se quiebra al morir.
// - Nacer: un rugido enorme que se oye en toda la dimensión, con el retumbo de la explosión.
// - Disparo: un soplo seco que silba; romper bloques: un crujido de piedra y madera que se parten.
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import type { MobSoundEvent } from './types';

type Sources = AudioScheduledSourceNode[];

/** Tres voces desafinadas (las tres cabezas) con un soplo por encima. */
function growl(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, f: number, fEnd: number, d: number, gain: number): Sources {
  const out: Sources = [];
  for (const [k, det] of [[1, 0], [1.33, 12], [0.75, -9]] as const) {
    out.push(playTonalBlip(ctx, { destination: dest, now: now + Math.random() * 0.05, freq: f * k, freqEnd: fEnd * k, wave: 'sawtooth', attack: 0.06, decay: d, gain: gain * (k === 1 ? 1 : 0.55), detune: det }));
  }
  out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'bandpass', freq: f * 5, freqEnd: fEnd * 4, q: 1.3, attack: 0.05, decay: d, gain: gain * 1.4 }));
  return out;
}

/** La voz del Wither (ambiente, herido, muerte y disparo). */
export function buildWitherVoice(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, dest: AudioNode, now: number): Sources {
  switch (ev) {
    case 'hurt':
      return growl(ctx, noise, dest, now, 120 + Math.random() * 30, 80, 0.7, 0.2);
    case 'death': {
      const out = growl(ctx, noise, dest, now, 110, 30, 4.5, 0.24);
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, freqEnd: 50, q: 0.7, attack: 0.2, decay: 5, gain: 0.6 }));
      return out;
    }
    case 'shoot':
      return buildWitherSfx(ctx, noise, 'wither_shoot', dest, now);
    default:
      return growl(ctx, noise, dest, now, 70 + Math.random() * 15, 55, 1.6, 0.14);
  }
}

/** Sonidos del Wither que no son su voz. */
export function buildWitherSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'wither_spawn': {
      const out = growl(ctx, noise, dest, now, 90, 40, 5, 0.3);
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700, freqEnd: 40, q: 0.7, attack: 0.01, decay: 4, gain: 0.9 }));
      out.push(playTonalBlip(ctx, { destination: dest, now, freq: 55, freqEnd: 25, wave: 'sine', attack: 0.02, decay: 4.5, gain: 0.5 }));
      return out;
    }
    case 'wither_shoot':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 900, freqEnd: 2200, q: 1.5, attack: 0.01, decay: 0.35, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 220, freqEnd: 110, wave: 'sawtooth', attack: 0.01, decay: 0.3, gain: 0.1 }),
      ];
    case 'wither_break':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 1800, freqEnd: 250, q: 0.9, attack: 0.002, decay: 0.5, gain: 0.7 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: now + 0.03, filterType: 'bandpass', freq: 2400, freqEnd: 800, q: 1.2, attack: 0.002, decay: 0.3, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 140, freqEnd: 60, wave: 'triangle', attack: 0.002, decay: 0.4, gain: 0.25 }),
      ];
    default:
      return [];
  }
}
