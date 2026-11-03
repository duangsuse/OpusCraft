// Sonidos de la experiencia: el tintineo de un orbe recogido (tono aleatorio, como en Minecraft) y la
// fanfarria de subir de nivel. Construido sobre las primitivas de dsp.ts.
import { playInharmonicRing, playTonalBlip } from './dsp';
import { randRange } from './types';

/** Tintineo corto y cristalino con tono aleatorio: se recoge un orbe. */
export function buildXpOrb(ctx: AudioContext, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const f = randRange(1250, 2300);
  return [
    playTonalBlip(ctx, { destination, now, freq: f, wave: 'sine', attack: 0.002, decay: 0.13, gain: 0.16 }),
    playTonalBlip(ctx, { destination, now, freq: f * 2.01, wave: 'sine', attack: 0.001, decay: 0.06, gain: 0.06 }),
    playTonalBlip(ctx, { destination, now: now + 0.035, freq: f * 1.5, wave: 'triangle', attack: 0.002, decay: 0.08, gain: 0.05 }),
  ];
}

/** Subir de nivel: arpegio mayor ascendente y un brillo metálico al final. */
export function buildLevelUp(ctx: AudioContext, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const base = randRange(520, 560);
  const sources: AudioScheduledSourceNode[] = [];
  [1, 1.26, 1.5, 2].forEach((mult, i) => {
    const t = now + i * 0.075;
    sources.push(playTonalBlip(ctx, { destination, now: t, freq: base * mult, wave: 'triangle', attack: 0.004, decay: 0.28 + i * 0.08, gain: 0.2 }));
    sources.push(playTonalBlip(ctx, { destination, now: t, freq: base * mult * 2, wave: 'sine', attack: 0.004, decay: 0.16, gain: 0.05 }));
  });
  sources.push(...playInharmonicRing(ctx, { destination, now: now + 0.3, baseFreq: base * 4, partials: [1, 2.76, 5.4], decay: 0.9, gain: 0.07 }));
  return sources;
}
