// Fase 7 (mecanismos): sonidos sintetizados de los mecanismos. El pistón que se extiende (un soplo que
// sube y el golpe de la cabeza) o se recoge (el soplo baja), el clic del dispensador y del soltador (con un
// silbido cuando dispara algo) y el clic seco cuando no tienen nada que soltar. (La mecha de la dinamita
// usa el siseo del creeper, como en Minecraft.)
import { playNoiseBurst, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange } from './types';

type Sources = AudioScheduledSourceNode[];

/** Pistón: `out` al extenderse, al revés al recogerse. */
function piston(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, out: boolean): Sources {
  const p = randRange(0.92, 1.08);
  const [f0, f1] = out ? [420 * p, 1500 * p] : [1300 * p, 380 * p];
  return [
    // El aire que empuja la cabeza.
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: f0, freqEnd: f1, q: 1.6, attack: 0.01, decay: 0.12, gain: 0.3 }),
    // El golpe de la cabeza al llegar (algo después) y un chasquido metálico.
    playTonalBlip(ctx, { destination: dest, now: now + 0.07, freq: 130 * p, freqEnd: 70 * p, wave: 'triangle', attack: 0.003, decay: 0.1, gain: 0.35 }),
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: now + 0.07, filterType: 'highpass', freq: 2600, q: 0.8, attack: 0.001, decay: 0.03, gain: 0.12 }),
  ];
}

/** Clic del dispensador o del soltador; `launch`: además, el silbido de lo que sale disparado. */
function click(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, launch: boolean, fail: boolean): Sources {
  const f = fail ? 1500 : 1000;
  const out: Sources = [
    playTonalBlip(ctx, { destination: dest, now, freq: f, freqEnd: f * 0.85, wave: 'square', attack: 0.001, decay: 0.025, gain: 0.08 }),
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: f * 2.4, q: 3, attack: 0.001, decay: 0.03, gain: 0.22 }),
  ];
  if (launch) {
    out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: now + 0.02, filterType: 'bandpass', freq: 900, freqEnd: 3200, q: 1.2, attack: 0.01, decay: 0.16, gain: 0.18 }));
  }
  return out;
}

/** Sonido de un efecto de los mecanismos (`a`: 1 al extenderse el pistón o al disparar el dispensador). */
export function buildMechanismSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, a: number, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'piston':
      return piston(ctx, noise, dest, now, a === 1);
    case 'dispense':
      return click(ctx, noise, dest, now, a === 1, false);
    case 'dispense_fail':
      return click(ctx, noise, dest, now, false, true);
  }
  return [];
}
