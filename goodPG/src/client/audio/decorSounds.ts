// Fase 6.5 (decoración): sonidos sintetizados de la campana (tañido largo con parciales inarmónicos,
// como una campana de bronce), de colgar y descolgar cuadros y marcos, y de girar el objeto del marco.
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

export function buildDecorSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'bell': {
      // Golpe metálico y parciales de campana (fundamental, tercera menor, quinta, octava…) que se apagan despacio.
      const f = 520 + Math.random() * 20;
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 3200, q: 3, attack: 0.001, decay: 0.05, gain: 0.12 }),
      ];
      for (const [ratio, gain, decay] of [[0.5, 0.1, 3.2], [1, 0.2, 2.8], [1.19, 0.1, 2.2], [1.5, 0.08, 1.8], [2, 0.08, 1.5], [2.74, 0.05, 1.1], [4.1, 0.03, 0.7]] as const) {
        out.push(playTonalBlip(ctx, { destination: dest, now, freq: f * ratio, wave: 'sine', attack: 0.003, decay, gain }));
      }
      return out;
    }
    case 'hang_place':
    case 'frame_add':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 900, q: 0.8, attack: 0.002, decay: 0.08, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 220, freqEnd: 170, wave: 'triangle', attack: 0.002, decay: 0.08, gain: 0.12 }),
      ];
    case 'hang_break':
    case 'frame_remove':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 700, q: 1.2, attack: 0.002, decay: 0.16, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 110, wave: 'triangle', attack: 0.002, decay: 0.14, gain: 0.12 }),
      ];
    case 'frame_rotate':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 2500, q: 0.7, attack: 0.002, decay: 0.05, gain: 0.08 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 900, freqEnd: 700, wave: 'triangle', attack: 0.002, decay: 0.05, gain: 0.05 }),
      ];
    // Fase 6.5 (remate): etiqueta (roce de papel), atar la correa (cuerda tensada) y romperla (chasquido).
    case 'name_tag':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 3000, q: 1.2, attack: 0.01, decay: 0.12, gain: 0.12 })];
    case 'leash':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 900, q: 2, attack: 0.004, decay: 0.1, gain: 0.2 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 140, freqEnd: 180, wave: 'triangle', attack: 0.004, decay: 0.09, gain: 0.08 }),
      ];
    // Soporte para armadura: madera al ponerlo o romperlo, y metal al vestirlo.
    case 'stand_place':
    case 'stand_break':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: kind === 'stand_break' ? 1400 : 900, q: 0.8, attack: 0.002, decay: kind === 'stand_break' ? 0.16 : 0.09, gain: 0.32 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 200, freqEnd: 130, wave: 'triangle', attack: 0.002, decay: 0.1, gain: 0.12 }),
      ];
    case 'stand_equip':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2600, q: 2, attack: 0.002, decay: 0.08, gain: 0.14 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 620, freqEnd: 480, wave: 'square', attack: 0.002, decay: 0.07, gain: 0.04 }),
      ];
    // Fase 6.5 (calderos): llenar el cubo (sorbo grave), vaciarlo (chapoteo) y lavar (chapoteo y frote).
    case 'cauldron_fill':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700, q: 1.5, attack: 0.02, decay: 0.3, gain: 0.35 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 320, wave: 'sine', attack: 0.02, decay: 0.25, gain: 0.08 }),
      ];
    case 'cauldron_empty':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1100, q: 0.9, attack: 0.01, decay: 0.35, gain: 0.3 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 300, freqEnd: 150, wave: 'sine', attack: 0.01, decay: 0.25, gain: 0.07 }),
      ];
    case 'cauldron_wash':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1500, q: 1.2, attack: 0.01, decay: 0.25, gain: 0.25 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: now + 0.12, filterType: 'highpass', freq: 3000, q: 0.7, attack: 0.01, decay: 0.2, gain: 0.08 }),
      ];
    case 'leash_break':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 1800, q: 0.8, attack: 0.001, decay: 0.06, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 320, freqEnd: 90, wave: 'triangle', attack: 0.001, decay: 0.12, gain: 0.1 }),
      ];
    // Fase 6.5 (remate): meter o sacar un libro de la estantería (roce de papel y golpe de madera).
    case 'shelf_put':
    case 'shelf_take':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: kind === 'shelf_put' ? 1800 : 2400, q: 1, attack: 0.004, decay: 0.09, gain: 0.18 }),
        playTonalBlip(ctx, { destination: dest, now, freq: kind === 'shelf_put' ? 160 : 210, freqEnd: 120, wave: 'triangle', attack: 0.002, decay: 0.07, gain: 0.1 }),
      ];
    default:
      return [];
  }
}
