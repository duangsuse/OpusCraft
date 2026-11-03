// Fase 7.5 (mansión): sonidos sintetizados del alay. Su voz es un tarareo agudo y cristalino (dos o tres
// notas de una escala pentatónica, con un deje de campanilla), más alegre cuando lleva algo; y los
// efectos de darle y quitarle el objeto, lanzar lo recogido, recogerlo y duplicarse.
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';

type Sources = AudioScheduledSourceNode[];

/** Escala pentatónica (La mayor) en la octava aguda. */
const PENTA = [880, 988, 1109, 1319, 1480, 1760];
const note = () => PENTA[Math.floor(Math.random() * PENTA.length)];

/** Una nota cantada: seno con un poco de triángulo y una campanilla muy suave encima. */
function hum(ctx: AudioContext, dest: AudioNode, now: number, f: number, dur: number, gain: number): Sources {
  return [
    playTonalBlip(ctx, { destination: dest, now, freq: f, freqEnd: f * 1.01, wave: 'sine', attack: 0.03, decay: dur, gain }),
    playTonalBlip(ctx, { destination: dest, now, freq: f * 2, wave: 'triangle', attack: 0.02, decay: dur * 0.6, gain: gain * 0.18 }),
    ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: f * 2, partials: [1, 2.76, 5.4], decay: dur * 0.8, gain: gain * 0.08 }),
  ];
}

/** Voz del alay (clave de sonido 'allay'). */
export function buildAllaySound(ctx: AudioContext, _noise: NoiseBuffers, kind: string, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (kind !== 'allay' || event === 'step') return [];
  if (event === 'hurt') {
    const f = randRange(1250, 1450);
    return [
      playPitchSweep(ctx, { destination: dest, now, freqStart: f, freqEnd: f * 0.7, attack: 0.01, decay: 0.16, gain: 0.12, wave: 'triangle' }),
      ...hum(ctx, dest, now + 0.05, f * 0.75, 0.12, 0.05),
    ];
  }
  if (event === 'death') {
    const out: Sources = [];
    [1760, 1319, 1109, 880].forEach((f, k) => out.push(...hum(ctx, dest, now + k * 0.13, f, 0.3, 0.1 - k * 0.015)));
    return out;
  }
  // En reposo: dos o tres notas que suben o bajan, como un «la-la» feliz.
  const out: Sources = [];
  const n = 2 + (Math.random() < 0.4 ? 1 : 0);
  let t = 0;
  for (let k = 0; k < n; k++) {
    const d = randRange(0.1, 0.17);
    out.push(...hum(ctx, dest, now + t, note(), d, 0.07));
    t += d + randRange(0.02, 0.06);
  }
  return out;
}

/** Efectos del alay: dar y quitar el objeto, recoger, lanzar y duplicarse. */
export function buildAllaySfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'allay_give': {
      // «¡Gracias!»: arpegio ascendente.
      const out: Sources = [];
      [880, 1109, 1319, 1760].forEach((f, k) => out.push(...hum(ctx, dest, now + k * 0.07, f, 0.18, 0.09)));
      return out;
    }
    case 'allay_take': {
      const out: Sources = [];
      [1319, 1109, 880].forEach((f, k) => out.push(...hum(ctx, dest, now + k * 0.08, f, 0.18, 0.08)));
      return out;
    }
    case 'allay_pickup':
      return [
        ...hum(ctx, dest, now, note(), 0.08, 0.06),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 5200, q: 3, attack: 0.005, decay: 0.05, gain: 0.03 }),
      ];
    case 'allay_throw':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1800, freqEnd: 3200, q: 1.5, attack: 0.01, decay: 0.16, gain: 0.08 }),
        ...hum(ctx, dest, now + 0.05, 1480, 0.14, 0.07),
      ];
    case 'allay_dup': {
      // Duplicarse: un destello mágico, arpegio que sube dos octavas con un brillo de campanas.
      const out: Sources = [];
      [880, 1109, 1319, 1760, 2218, 2637].forEach((f, k) => out.push(...hum(ctx, dest, now + k * 0.05, f, 0.25, 0.08)));
      out.push(...playInharmonicRing(ctx, { destination: dest, now: now + 0.3, baseFreq: 1760, partials: [1, 2.01, 2.76, 4.1], decay: 1.1, gain: 0.06 }));
      return out;
    }
    default:
      return [];
  }
}
