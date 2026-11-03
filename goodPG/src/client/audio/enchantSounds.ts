// Fase 7 (encantamientos): sonidos sintetizados de la mesa de encantamientos (un arpegio de campanillas
// con un soplo de aire que sube), el yunque (golpe de metal al usarlo, más grave al caer, estrépito al
// romperse), la afiladora (piedra que rasca), la botella con experiencia al romperse y las espinas.
import { playNoiseBurst, playTonalBlip, playInharmonicRing } from './dsp';
import type { NoiseBuffers } from './noise';

type Sources = AudioScheduledSourceNode[];

/** Notas del arpegio de la mesa (una escala pentatónica que sube y se abre). */
const ENCHANT_NOTES = [784, 988, 1175, 1319, 1568, 1976];

export function buildEnchantSfx(ctx: AudioContext, noise: NoiseBuffers, kind: string, dest: AudioNode, now: number): Sources {
  switch (kind) {
    case 'enchant': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 600, freqEnd: 3200, q: 1.4, attack: 0.25, decay: 0.9, gain: 0.12 }),
      ];
      const start = Math.floor(Math.random() * 2);
      for (let i = 0; i < 5; i++) {
        const t = now + 0.05 + i * 0.075 + Math.random() * 0.02;
        const f = ENCHANT_NOTES[(start + i) % ENCHANT_NOTES.length] * (Math.random() < 0.5 ? 1 : 1.5);
        out.push(playTonalBlip(ctx, { destination: dest, now: t, freq: f, wave: 'sine', attack: 0.004, decay: 0.9, gain: 0.11 }));
        out.push(playTonalBlip(ctx, { destination: dest, now: t, freq: f * 2.01, wave: 'sine', attack: 0.004, decay: 0.35, gain: 0.035, detune: 7 }));
      }
      return out;
    }
    case 'anvil_use':
      return [
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 820, partials: [1, 2.32, 3.87, 5.4], decay: 0.55, gain: 0.3 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3000, q: 0.7, attack: 0.001, decay: 0.05, gain: 0.25 }),
      ];
    case 'anvil_land':
      return [
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 430, partials: [1, 2.21, 3.4, 4.9], decay: 0.8, gain: 0.34 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, freqEnd: 90, q: 0.8, attack: 0.002, decay: 0.3, gain: 0.6 }),
      ];
    case 'anvil_destroy': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 2200, freqEnd: 600, q: 0.6, attack: 0.002, decay: 0.45, gain: 0.45 }),
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 520, partials: [1, 1.73, 2.9, 4.1], decay: 0.4, gain: 0.25 }),
      ];
      for (let i = 0; i < 5; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + 0.08 + Math.random() * 0.35, freq: 1400 + Math.random() * 1800, wave: 'triangle', attack: 0.001, decay: 0.08, gain: 0.08 }));
      }
      return out;
    }
    // Fase 8.5: el nexo de reaparición: al cargarlo, un zumbido grave que sube con la carga (`a`: cargas) sobre el
    // crujido de la piedra luminosa; al fijar el punto, un acorde hondo que resuena; al gastar una carga, un soplo
    // que baja. La brújula magnetizada: un chasquido metálico con un tono que tiembla.
    case 'anchor_charge': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1800, q: 1.2, attack: 0.002, decay: 0.12, gain: 0.25 }),
      ];
      out.push(playTonalBlip(ctx, { destination: dest, now, freq: 70, freqEnd: 140, wave: 'sawtooth', attack: 0.05, decay: 0.9, gain: 0.12 }));
      out.push(playTonalBlip(ctx, { destination: dest, now: now + 0.05, freq: 280, freqEnd: 420, wave: 'sine', attack: 0.08, decay: 0.8, gain: 0.08, detune: 9 }));
      return out;
    }
    case 'anchor_set':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 110, wave: 'sine', attack: 0.02, decay: 1.6, gain: 0.22 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 165, wave: 'sine', attack: 0.04, decay: 1.4, gain: 0.14 }),
        playTonalBlip(ctx, { destination: dest, now: now + 0.06, freq: 220, wave: 'triangle', attack: 0.04, decay: 1.2, gain: 0.09 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'lowpass', freq: 900, freqEnd: 200, q: 0.7, attack: 0.05, decay: 1.2, gain: 0.2 }),
      ];
    case 'anchor_deplete':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 1600, freqEnd: 300, q: 1.1, attack: 0.02, decay: 0.7, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 200, freqEnd: 70, wave: 'sine', attack: 0.02, decay: 0.8, gain: 0.14 }),
      ];
    // Fase 8.5: columnas de burbujas: las que suben borbotean en la superficie; las de magma, un remolino grave.
    case 'bubble_pop': {
      const out: Sources = [];
      for (let i = 0; i < 4; i++) {
        const f = 500 + Math.random() * 700;
        out.push(playTonalBlip(ctx, { destination: dest, now: now + i * (0.03 + Math.random() * 0.05), freq: f, freqEnd: f * 1.8, wave: 'sine', attack: 0.002, decay: 0.05, gain: 0.07 }));
      }
      return out;
    }
    case 'whirlpool':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 500, freqEnd: 250, q: 1.4, attack: 0.3, decay: 1.2, gain: 0.2 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.1, filterType: 'bandpass', freq: 900, freqEnd: 400, q: 2, attack: 0.2, decay: 0.9, gain: 0.08 }),
      ];
    case 'lodestone_lock':
      return [
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: 1250, partials: [1, 2.7, 4.2], decay: 0.35, gain: 0.16 }),
        playTonalBlip(ctx, { destination: dest, now: now + 0.02, freq: 520, freqEnd: 560, wave: 'sine', attack: 0.03, decay: 0.9, gain: 0.08, detune: 14 }),
      ];
    // Fase 8.5: el faro: se enciende con un barrido que sube y un acorde brillante, se apaga bajando, zumba cerca
    // mientras funciona y suena un tintineo al elegir un poder.
    case 'beacon_activate':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 720, wave: 'sine', attack: 0.3, decay: 1.4, gain: 0.16 }),
        playTonalBlip(ctx, { destination: dest, now: now + 0.25, freq: 523, wave: 'sine', attack: 0.1, decay: 1.6, gain: 0.08, detune: 6 }),
        playTonalBlip(ctx, { destination: dest, now: now + 0.35, freq: 784, wave: 'sine', attack: 0.1, decay: 1.4, gain: 0.06 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 800, freqEnd: 3000, q: 1.2, attack: 0.3, decay: 1, gain: 0.08 }),
      ];
    case 'beacon_deactivate':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 620, freqEnd: 140, wave: 'sine', attack: 0.05, decay: 1.2, gain: 0.15 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now, filterType: 'bandpass', freq: 2400, freqEnd: 500, q: 1.2, attack: 0.05, decay: 1, gain: 0.07 }),
      ];
    case 'beacon_ambient':
      return [
        playTonalBlip(ctx, { destination: dest, now, freq: 146, wave: 'sine', attack: 0.8, decay: 3.2, gain: 0.07, detune: 4 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 219, wave: 'sine', attack: 0.8, decay: 3, gain: 0.04 }),
      ];
    case 'beacon_power': {
      const out: Sources = [];
      [880, 1175, 1568].forEach((f, i) => out.push(playTonalBlip(ctx, { destination: dest, now: now + i * 0.07, freq: f, wave: 'sine', attack: 0.005, decay: 0.8, gain: 0.09 })));
      return out;
    }
    // Fase 8.6: el trueno del destello del End: un retumbo grave y larguísimo que crece y se apaga, con un
    // silbido alto encima.
    case 'end_flash':
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 260, freqEnd: 90, q: 0.9, attack: 0.9, decay: 4.5, gain: 0.55 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 55, freqEnd: 38, wave: 'sine', attack: 1.2, decay: 4, gain: 0.25 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.4, filterType: 'bandpass', freq: 2600, freqEnd: 900, q: 3, attack: 0.8, decay: 2.6, gain: 0.05 }),
      ];
    // Fase 8.5: la mesa de herrería: tres martillazos metálicos que se apagan.
    case 'smithing': {
      const out: Sources = [];
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.13;
        out.push(...playInharmonicRing(ctx, { destination: dest, now: t, baseFreq: 980 - i * 60, partials: [1, 2.4, 3.9], decay: 0.22, gain: 0.22 - i * 0.05 }));
        out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: t, filterType: 'bandpass', freq: 2600, q: 2, attack: 0.001, decay: 0.03, gain: 0.2 }));
      }
      return out;
    }
    case 'grindstone': {
      const out: Sources = [];
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.09;
        out.push(playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now: t, filterType: 'bandpass', freq: 1800 + Math.random() * 900, q: 3, attack: 0.01, decay: 0.12, gain: 0.2 }));
      }
      out.push(playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 400, q: 0.7, attack: 0.02, decay: 0.4, gain: 0.3 }));
      return out;
    }
    case 'xp_bottle': {
      const out: Sources = [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 3500, q: 0.8, attack: 0.001, decay: 0.12, gain: 0.35 }),
      ];
      for (let i = 0; i < 6; i++) {
        out.push(playTonalBlip(ctx, { destination: dest, now: now + Math.random() * 0.15, freq: 2600 + Math.random() * 3000, wave: 'sine', attack: 0.001, decay: 0.06 + Math.random() * 0.05, gain: 0.07 }));
      }
      return out;
    }
    case 'thorns':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 5200, freqEnd: 2600, q: 3, attack: 0.001, decay: 0.07, gain: 0.25 }),
        playTonalBlip(ctx, { destination: dest, now, freq: 180, freqEnd: 90, wave: 'triangle', attack: 0.002, decay: 0.12, gain: 0.2 }),
      ];
  }
  return [];
}
