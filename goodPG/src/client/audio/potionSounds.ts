// Fase 7 (pociones): sonidos sintetizados de las pociones: beber (tragos: un golpe grave de garganta
// con un gorgoteo), llenar un frasco (burbujas que suben de tono) y vaciarlo (un chorro que baja), el
// alambique al terminar (burbujeo con un tintineo de cristal), la poción que se rompe (cristal que
// estalla y una salpicadura) y el siseo de la nube persistente al formarse.
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange } from './types';

type Sources = AudioScheduledSourceNode[];

/** Burbujas: `n` barridos cortos de tono entre `lo` y `hi` Hz repartidos en `span` segundos. */
function bubbles(ctx: AudioContext, dest: AudioNode, now: number, n: number, span: number, lo: number, hi: number, up: boolean, gain: number): Sources {
  const out: Sources = [];
  for (let i = 0; i < n; i++) {
    const t = now + (i / n) * span + randRange(0, span / n);
    const f = randRange(lo, hi);
    out.push(playPitchSweep(ctx, {
      destination: dest, now: t, freqStart: f, freqEnd: up ? f * randRange(1.6, 2.2) : f * randRange(0.5, 0.7), attack: 0.004,
      decay: randRange(0.04, 0.08), gain: gain * randRange(0.6, 1),
    }));
  }
  return out;
}

export function buildPotionSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'drink': {
      // Un trago: golpe sordo de garganta y un gorgoteo líquido.
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: randRange(150, 180), freqEnd: 90, wave: 'sine', attack: 0.01, decay: 0.12, gain: 0.35 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700, freqEnd: 300, q: 1, attack: 0.02, decay: 0.12, gain: 0.3 }),
        ...bubbles(ctx, dest, now + 0.03, 3, 0.1, 380, 620, true, 0.12),
      ];
    }
    case 'bottle_fill':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 900, freqEnd: 1800, q: 1.4, attack: 0.03, decay: 0.35, gain: 0.18 }),
        ...bubbles(ctx, dest, now, 7, 0.4, 300, 700, true, 0.16),
      ];
    case 'bottle_empty':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1600, freqEnd: 700, q: 1.2, attack: 0.02, decay: 0.4, gain: 0.2 }),
        ...bubbles(ctx, dest, now + 0.05, 5, 0.35, 500, 900, false, 0.12),
      ];
    case 'brew':
      // El alambique acaba: burbujeo y un tintineo de los frascos.
      return [
        ...bubbles(ctx, dest, now, 9, 0.6, 250, 520, true, 0.14),
        ...playInharmonicRing(ctx, { destination: dest, now: now + 0.25, baseFreq: randRange(1900, 2200), partials: [1, 2.32, 4.1], decay: 0.6, gain: 0.07 }),
      ];
    case 'splash': {
      // Cristal que estalla (varios chasquidos agudos) y el líquido que salpica.
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3000, q: 0.8, attack: 0.002, decay: 0.12, gain: 0.35 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.02, filterType: 'bandpass', freq: 1200, freqEnd: 500, q: 0.9, attack: 0.01, decay: 0.3, gain: 0.25 }),
      ];
      for (let i = 0; i < 4; i++) {
        out.push(...playInharmonicRing(ctx, { destination: dest, now: now + randRange(0, 0.09), baseFreq: randRange(2400, 3800), partials: [1, 2.7, 5.1], decay: randRange(0.08, 0.2), gain: 0.05 }));
      }
      return out;
    }
    case 'cloud':
      // Siseo suave de la nube persistente al formarse.
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 2200, freqEnd: 900, q: 0.7, attack: 0.08, decay: 0.9, gain: 0.12 })];
    default:
      return [];
  }
}
