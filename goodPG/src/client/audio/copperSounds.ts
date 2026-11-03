// Fase 6.5 (cobre): encerar un bloque de cobre (un roce blando y pegajoso con un tintineo metálico
// apagado) y rasparlo con el hacha (chirrido de metal: ruido agudo que baja y unas notas inarmónicas).
import { playInharmonicRing, playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange } from './types';

type Sources = AudioScheduledSourceNode[];

export function buildCopperSfx(ctx: AudioContext, noise: NoiseBuffers, kind: 'wax' | 'scrape', dest: AudioNode, now: number): Sources {
  if (kind === 'wax') {
    return [
      playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: randRange(700, 900), freqEnd: 420, q: 1.2, attack: 0.02, decay: 0.28, gain: 0.3 }),
      playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now: now + 0.05, filterType: 'lowpass', freq: 500, q: 0.7, attack: 0.03, decay: 0.2, gain: 0.25 }),
      playTonalBlip(ctx, { destination: dest, now, freq: randRange(900, 1100), freqEnd: 820, wave: 'sine', attack: 0.004, decay: 0.12, gain: 0.06 }),
    ];
  }
  const out: Sources = [];
  // Dos o tres pasadas del filo, cada una un chirrido corto.
  const strokes = 2 + Math.floor(Math.random() * 2);
  for (let k = 0; k < strokes; k++) {
    const t = now + k * randRange(0.08, 0.12);
    out.push(playNoiseBurst(ctx, {
      buffer: noise.white, destination: dest, now: t, filterType: 'bandpass', freq: randRange(3200, 4200), freqEnd: randRange(1600, 2200), q: 6,
      attack: 0.005, decay: 0.09, gain: 0.22,
    }));
  }
  out.push(...playInharmonicRing(ctx, { destination: dest, now, baseFreq: randRange(1200, 1500), partials: [1, 2.76, 5.4], decay: 0.35, gain: 0.05 }));
  return out;
}
