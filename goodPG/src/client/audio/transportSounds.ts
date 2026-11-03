// Fase 7 (transporte): sonidos sintetizados de las barcas y las vagonetas.
// - Remo: el chapoteo de la pala al entrar en el agua (en tierra, un roce de madera).
// - Barca: golpe de madera hueca al ponerla, al golpearla y al romperla (tablones que crujen).
// - Vagoneta: golpe metálico al ponerla o golpearla, estruendo de chapa al romperla y, en marcha, el
//   traqueteo de las ruedas en cada junta de la vía (más fuerte y agudo cuanto más rápido va).
// - Subirse: un crujido corto.
// `a`: 1 si es una vagoneta (metal), 0 si es una barca (madera); en el traqueteo, la velocidad (0..1).
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

function woodKnock(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, gain: number): Sources {
  return [
    playTonalBlip(ctx, { destination: dest, now, freq: 190, freqEnd: 120, wave: 'triangle', attack: 0.002, decay: 0.16, gain: gain * 0.7 }),
    playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 700, q: 1.4, attack: 0.002, decay: 0.12, gain }),
  ];
}

function metalClank(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, gain: number): Sources {
  return [
    playTonalBlip(ctx, { destination: dest, now, freq: 620, freqEnd: 560, wave: 'square', attack: 0.001, decay: 0.22, gain: gain * 0.18 }),
    playTonalBlip(ctx, { destination: dest, now, freq: 1370, wave: 'sine', attack: 0.001, decay: 0.35, gain: gain * 0.2 }),
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2600, q: 1.2, attack: 0.001, decay: 0.08, gain: gain * 0.6 }),
  ];
}

export function buildTransportSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number, a = 0): Sources {
  const metal = a >= 1;
  switch (kind) {
    case 'paddle':
      // Chapoteo: un siseo de agua que baja de tono y un "plop" grave.
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1800, freqEnd: 700, q: 0.9, attack: 0.02, decay: 0.3, gain: 0.32 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, q: 0.7, attack: 0.01, decay: 0.18, gain: 0.35 }),
      ];
    case 'paddle_land':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 900, q: 1.1, attack: 0.03, decay: 0.2, gain: 0.25 })];
    case 'vehicle_place':
    case 'vehicle_hit':
      return metal ? metalClank(ctx, noise, dest, now, kind === 'vehicle_hit' ? 0.8 : 0.6) : woodKnock(ctx, noise, dest, now, kind === 'vehicle_hit' ? 0.8 : 0.6);
    case 'vehicle_break': {
      const out: Sources = metal ? metalClank(ctx, noise, dest, now, 1) : woodKnock(ctx, noise, dest, now, 1);
      // Crujidos o chapas que caen después.
      for (let i = 0; i < 4; i++) {
        const t = now + 0.05 + i * 0.07 + Math.random() * 0.03;
        out.push(metal
          ? playTonalBlip(ctx, { destination: dest, now: t, freq: 900 + Math.random() * 900, wave: 'sine', attack: 0.001, decay: 0.12, gain: 0.12 })
          : playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: t, filterType: 'bandpass', freq: 500 + Math.random() * 600, q: 2, attack: 0.002, decay: 0.07, gain: 0.35 }));
      }
      return out;
    }
    case 'vehicle_board':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: metal ? 1600 : 600, q: 1.5, attack: 0.005, decay: 0.1, gain: 0.3 })];
    case 'cart_roll': {
      // Dos golpes secos (ruedas de delante y de detrás) sobre la junta y un poco de chirrido.
      const v = Math.max(0.1, Math.min(1, a));
      const gap = 0.05 + (1 - v) * 0.12;
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700 + v * 800, q: 0.8, attack: 0.002, decay: 0.07, gain: 0.25 + v * 0.3 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now: now + gap, filterType: 'lowpass', freq: 700 + v * 800, q: 0.8, attack: 0.002, decay: 0.07, gain: 0.2 + v * 0.25 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 3200 + v * 1500, q: 6, attack: 0.02, decay: 0.2, gain: 0.03 + v * 0.05 }),
      ];
    }
    default:
      return [];
  }
}
