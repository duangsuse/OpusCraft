// Fase 7.5 (abismo): sonidos sintetizados del Deep Dark (todos originales): la voz del warden (gruñidos
// graves, rugido, olfateo, pasos que retumban, latido, zarcillos, estampido sónico), los chasquidos de
// los sensores de sculk, la resonancia de la amatista, el chillido del chillador, el aviso lejano del
// warden, el catalizador que florece, el sculk que se extiende y el ambiente del Deep Dark.
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent } from './types';

type Sources = AudioScheduledSourceNode[];

/** Paso del warden: golpe sordo que retumba. */
function wardenStep(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, gain = 1): Sources {
  return [
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 180, q: 1.2, attack: 0.005, decay: 0.3, gain: 0.45 * gain }),
    playTonalBlip(ctx, { destination: dest, now, freq: 48, freqEnd: 32, wave: 'sine', attack: 0.004, decay: 0.32, gain: 0.4 * gain }),
  ];
}

/** Gruñido grave y gutural (con un ronquido de ruido detrás). */
function growl(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, f0: number, f1: number, dur: number, gain: number): Sources {
  return [
    playPitchSweep(ctx, { destination: dest, now, freqStart: f0, freqEnd: f1, attack: 0.08, decay: dur, gain: gain * 0.5, wave: 'sawtooth' }),
    playPitchSweep(ctx, { destination: dest, now: now + 0.02, freqStart: f0 * 1.51, freqEnd: f1 * 1.48, attack: 0.08, decay: dur, gain: gain * 0.2, wave: 'square' }),
    playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'bandpass', freq: f0 * 4, freqEnd: f1 * 3, q: 2.5, attack: 0.08, decay: dur, gain: gain * 0.6 }),
  ];
}

/** Voz del warden por evento. */
export function buildWardenSound(ctx: AudioContext, noise: NoiseBuffers, kind: string, event: MobSoundEvent, dest: AudioNode, now: number): Sources {
  if (kind !== 'warden') return [];
  switch (event) {
    case 'step':
      return wardenStep(ctx, noise, dest, now);
    case 'hurt':
      return growl(ctx, noise, dest, now, randRange(110, 140), 70, 0.35, 0.5);
    case 'death':
      return [...growl(ctx, noise, dest, now, 120, 30, 2.2, 0.6), ...wardenStep(ctx, noise, dest, now + 1.6, 1.3)];
    case 'attack':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'lowpass', freq: 900, q: 0.8, attack: 0.002, decay: 0.18, gain: 0.5 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 70, freqEnd: 40, wave: 'sine', attack: 0.002, decay: 0.25, gain: 0.5 }),
      ];
    default:
      return growl(ctx, noise, dest, now, randRange(60, 80), randRange(45, 55), randRange(0.8, 1.4), 0.35);
  }
}

/** Efectos del Deep Dark por su clave (`a`: dato del efecto: nivel del aviso, potencia…). */
export function buildDeepDarkSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number, a = 0): Sources {
  const out: Sources = [];
  switch (kind) {
    case 'sculk_clicking': {
      // Zarcillos que chasquean: una ráfaga de clics secos.
      for (let i = 0; i < 7; i++) {
        out.push(playNoiseBurst(ctx, {
          buffer: noise.white, destination: dest, now: now + i * randRange(0.025, 0.05), filterType: 'bandpass', freq: randRange(1800, 3200),
          q: 8, attack: 0.001, decay: 0.018, gain: 0.3,
        }));
      }
      break;
    }
    case 'warden_tendril':
      for (let i = 0; i < 5; i++) {
        out.push(playNoiseBurst(ctx, {
          buffer: noise.white, destination: dest, now: now + i * 0.04, filterType: 'bandpass', freq: randRange(900, 1500), q: 6, attack: 0.001,
          decay: 0.03, gain: 0.35,
        }));
      }
      break;
    case 'amethyst_resonate':
      out.push(...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 700 + a * 60, partials: [1, 2.02, 3.1, 4.3], decay: 1.4, gain: 0.18 }));
      break;
    case 'sculk_bloom':
      out.push(playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 500, freqEnd: 1600, q: 1.5, attack: 0.1, decay: 0.8, gain: 0.25 }));
      out.push(...playInharmonicRing(ctx, { destination: dest, now: now + 0.1, baseFreq: 520, partials: [1, 1.5, 2.25], decay: 1.1, gain: 0.08 }));
      break;
    case 'sculk_spread':
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700, freqEnd: 300, q: 1.6, attack: 0.01, decay: 0.2, gain: 0.25 }));
      out.push(playPitchSweep(ctx, { destination: dest, now, freqStart: 300, freqEnd: 110, attack: 0.005, decay: 0.15, gain: 0.12 }));
      break;
    case 'shriek': {
      // Chillido: un lamento agudo que tiembla y se quiebra, con un aliento de ruido.
      const f = randRange(620, 720);
      for (let k = 0; k < 6; k++) {
        const t = now + k * 0.22;
        out.push(playPitchSweep(ctx, { destination: dest, now: t, freqStart: f * (1 + (k % 2) * 0.06), freqEnd: f * (0.92 + (k % 2) * 0.1), attack: 0.03, decay: 0.26, gain: 0.16, wave: 'sawtooth' }));
      }
      out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2400, freqEnd: 1200, q: 3, attack: 0.05, decay: 1.4, gain: 0.2 }));
      break;
    }
    case 'warden_warning': {
      // El warden, cada vez más cerca: gruñidos lejanos (1), más cercanos (2) y justo al lado (3).
      const g = [0.15, 0.25, 0.4][Math.max(0, Math.min(2, a - 1))];
      out.push(...growl(ctx, noise, dest, now, 70, 45, 1.2 + a * 0.3, g));
      for (let k = 0; k < a; k++) out.push(...wardenStep(ctx, noise, dest, now + 0.4 + k * 0.7, g * 1.5));
      break;
    }
    case 'warden_emerge':
    case 'warden_dig':
      for (let k = 0; k < 10; k++) {
        const t = now + k * randRange(0.3, 0.55);
        out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now: t, filterType: 'lowpass', freq: randRange(250, 500), q: 1, attack: 0.01, decay: 0.3, gain: 0.35 }));
      }
      out.push(...growl(ctx, noise, dest, now + (kind === 'warden_emerge' ? 3.5 : 0.2), 90, 50, 1.8, 0.4));
      break;
    case 'warden_roar':
      out.push(...growl(ctx, noise, dest, now, 95, 150, 0.9, 0.7));
      out.push(...growl(ctx, noise, dest, now + 0.9, 150, 60, 2.2, 0.7));
      break;
    case 'warden_sniff':
      for (let k = 0; k < 4; k++) {
        out.push(playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.8 + k * 0.28, filterType: 'bandpass', freq: 1100, q: 2, attack: 0.03, decay: 0.12, gain: 0.3 }));
      }
      out.push(...growl(ctx, noise, dest, now + 2.4, 70, 60, 1, 0.2));
      break;
    case 'warden_sonic_charge':
      out.push(playPitchSweep(ctx, { destination: dest, now, freqStart: 90, freqEnd: 900, attack: 1.2, decay: 0.5, gain: 0.25, wave: 'sawtooth' }));
      out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 400, freqEnd: 3000, q: 4, attack: 1.4, decay: 0.3, gain: 0.25 }));
      break;
    case 'warden_sonic_boom':
      out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'lowpass', freq: 2500, freqEnd: 200, q: 0.8, attack: 0.002, decay: 1.2, gain: 0.9 }));
      out.push(playTonalBlip(ctx, { destination: dest, now, freq: 70, freqEnd: 28, wave: 'sine', attack: 0.002, decay: 1, gain: 0.8 }));
      out.push(...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 180, partials: [1, 1.34, 2.6, 3.9], decay: 1.6, gain: 0.3 }));
      break;
    case 'warden_heartbeat':
      out.push(playTonalBlip(ctx, { destination: dest, now, freq: 58, freqEnd: 40, wave: 'sine', attack: 0.004, decay: 0.16, gain: 0.35 }));
      out.push(playTonalBlip(ctx, { destination: dest, now: now + 0.2, freq: 52, freqEnd: 36, wave: 'sine', attack: 0.004, decay: 0.14, gain: 0.25 }));
      break;
    case 'deep_dark_ambient': {
      // Un lamento lejano y grave que viene de ninguna parte, con goteos.
      out.push(playPitchSweep(ctx, { destination: dest, now, freqStart: randRange(90, 120), freqEnd: randRange(60, 80), attack: 1.2, decay: 2.5, gain: 0.12, wave: 'triangle' }));
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 220, q: 0.7, attack: 1.5, decay: 2.5, gain: 0.18 }));
      for (let k = 0; k < 3; k++) {
        out.push(playPitchSweep(ctx, { destination: dest, now: now + randRange(0.5, 3), freqStart: randRange(1400, 2200), freqEnd: randRange(600, 900), attack: 0.002, decay: 0.08, gain: 0.05 }));
      }
      break;
    }
  }
  return out;
}
