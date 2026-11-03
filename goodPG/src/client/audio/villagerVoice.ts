// Voz de los aldeanos (fase 6): el «hmm» nasal de Minecraft, sintetizado con dos tonos (uno suave y
// otro cuadrado una octava arriba que le da la nariz). «Sí» sube, «no» baja; el daño es un quejido corto.
import { playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';

function hmm(ctx: AudioContext, destination: AudioNode, now: number, f0: number, f1: number, dur: number, gain: number): AudioScheduledSourceNode[] {
  return [
    playTonalBlip(ctx, { destination, now, freq: f0, freqEnd: f1, wave: 'triangle', attack: 0.03, decay: dur, gain }),
    playTonalBlip(ctx, { destination, now, freq: f0 * 2, freqEnd: f1 * 2, wave: 'square', attack: 0.03, decay: dur, gain: gain * 0.12 }),
  ];
}

export function villagerSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  void noise;
  const k = randRange(0.92, 1.08);
  switch (event) {
    case 'hurt':
      return hmm(ctx, destination, now, 300 * k, 230 * k, 0.16, 0.3);
    case 'death':
      return hmm(ctx, destination, now, 260 * k, 120 * k, 0.55, 0.3);
    case 'attack': // «sí»: trato hecho
      return [...hmm(ctx, destination, now, 190 * k, 230 * k, 0.12, 0.26), ...hmm(ctx, destination, now + 0.15, 220 * k, 280 * k, 0.16, 0.26)];
    case 'fuse': // «no»
      return hmm(ctx, destination, now, 250 * k, 170 * k, 0.3, 0.28);
    default:
      return hmm(ctx, destination, now, 200 * k, 235 * k, 0.22, 0.22);
  }
}
