// Timbres por material: golpes de romper/colocar/pisar/aterrizar, más el chapoteo y los
// sonidos de interfaz. Cada llamada aleatoriza tono/filtro/duración para que las repeticiones
// no suenen idénticas.
import type { NoiseBuffers } from './noise';
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import { clamp01, randRange, type SoundKind, type SoundMaterial, type UiKind } from './types';
import { buildNetherMaterial } from './netherMaterials'; // Fase 8.2 (biomas del Nether)

/** Volumen relativo y duración relativa según el tipo de interacción. */
function kindProfile(kind: SoundKind, energy: number): { gain: number; dur: number } {
  const e = clamp01(energy);
  switch (kind) {
    case 'break':
      return { gain: 1, dur: 1.15 };
    case 'place':
      return { gain: 0.55, dur: 0.8 };
    case 'step':
      return { gain: 0.32 * e, dur: 0.6 };
    case 'land':
      return { gain: 0.25 + 0.9 * e, dur: 0.85 + 0.4 * e };
    default:
      return { gain: 0.5, dur: 0.8 };
  }
}

/**
 * Construye las fuentes de audio (ya iniciadas/programadas) para un golpe de material.
 * `destination` es el nodo al que deben conectarse (normalmente un PannerNode).
 */
export function buildMaterialSound(
  ctx: AudioContext,
  noise: NoiseBuffers,
  material: SoundMaterial,
  kind: SoundKind,
  energy: number,
  destination: AudioNode,
  now: number,
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const { gain: g, dur: d } = kindProfile(kind, energy);

  switch (material) {
    case 'stone': {
      const hits = kind === 'break' ? 2 : 1;
      for (let i = 0; i < hits; i++) {
        const t = now + i * randRange(0.02, 0.05);
        sources.push(
          playNoiseBurst(ctx, {
            buffer: noise.white,
            destination,
            now: t,
            filterType: 'bandpass',
            freq: randRange(900, 1900),
            q: randRange(1.5, 3.2),
            attack: 0.001,
            decay: 0.045 * d * randRange(0.8, 1.2),
            gain: 0.65 * g,
          }),
        );
        sources.push(
          playTonalBlip(ctx, {
            destination,
            now: t,
            freq: randRange(90, 170),
            freqEnd: randRange(45, 70),
            wave: 'triangle',
            attack: 0.001,
            decay: 0.05 * d,
            gain: 0.4 * g,
          }),
        );
      }
      break;
    }
    case 'wood': {
      const body = randRange(200, 420);
      sources.push(
        playTonalBlip(ctx, { destination, now, freq: body, freqEnd: body * 0.88, wave: 'triangle', attack: 0.002, decay: 0.13 * d, gain: 0.55 * g }),
      );
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: body * 2.4, q: 5, attack: 0.001, decay: 0.06 * d, gain: 0.3 * g }),
      );
      break;
    }
    case 'grass': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(1200, 2200), q: 0.5, attack: 0.003, decay: 0.09 * d, gain: 0.5 * g }),
      );
      break;
    }
    case 'leaves': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(2200, 3600), q: 0.4, attack: 0.002, decay: 0.07 * d, gain: 0.4 * g }),
      );
      sources.push(
        playNoiseBurst(ctx, {
          buffer: noise.pink,
          destination,
          now: now + randRange(0.02, 0.05),
          filterType: 'highpass',
          freq: randRange(1800, 3000),
          q: 0.4,
          attack: 0.002,
          decay: 0.06 * d,
          gain: 0.28 * g,
        }),
      );
      break;
    }
    case 'dirt': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.brown, destination, now, filterType: 'lowpass', freq: randRange(400, 800), q: 0.7, attack: 0.003, decay: 0.09 * d, gain: 0.6 * g }),
      );
      sources.push(playTonalBlip(ctx, { destination, now, freq: randRange(70, 110), wave: 'sine', attack: 0.002, decay: 0.07 * d, gain: 0.35 * g }));
      break;
    }
    case 'sand': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(3200, 5000), q: 0.4, attack: 0.006, decay: 0.11 * d, gain: 0.38 * g }),
      );
      break;
    }
    case 'gravel': {
      const clicks = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < clicks; i++) {
        const t = now + Math.random() * 0.07 * d;
        sources.push(
          playNoiseBurst(ctx, {
            buffer: noise.white,
            destination,
            now: t,
            filterType: 'bandpass',
            freq: randRange(1000, 3200),
            q: randRange(2, 5),
            attack: 0.001,
            decay: randRange(0.02, 0.045),
            gain: (0.55 / clicks + 0.08) * g,
          }),
        );
      }
      break;
    }
    case 'glass': {
      if (kind === 'break') {
        const n = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const t = now + Math.random() * 0.14;
          sources.push(
            playTonalBlip(ctx, { destination, now: t, freq: randRange(1800, 5200), wave: 'sine', attack: 0.001, decay: randRange(0.08, 0.18), gain: (0.4 / Math.sqrt(n)) * g }),
          );
        }
        sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 4200, q: 0.5, attack: 0.001, decay: 0.16, gain: 0.22 * g }));
      } else {
        sources.push(playTonalBlip(ctx, { destination, now, freq: randRange(2200, 3200), wave: 'sine', attack: 0.001, decay: 0.09 * d, gain: 0.5 * g }));
      }
      break;
    }
    case 'snow': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'lowpass', freq: randRange(800, 1400), q: 0.5, attack: 0.005, decay: 0.09 * d, gain: 0.4 * g }),
      );
      break;
    }
    case 'wool': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.brown, destination, now, filterType: 'lowpass', freq: randRange(300, 600), q: 0.6, attack: 0.006, decay: 0.1 * d, gain: 0.32 * g }),
      );
      break;
    }
    case 'metal': {
      const base = randRange(280, 700);
      sources.push(
        ...playInharmonicRing(ctx, { destination, now, baseFreq: base, partials: [1, 1.62, 2.41, 3.89, 5.2], decay: 0.5 * d * randRange(0.8, 1.3), gain: 0.5 * g }),
      );
      sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 3200, q: 0.5, attack: 0.001, decay: 0.03, gain: 0.18 * g }));
      break;
    }
    case 'water': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(600, 1400), q: 1.2, attack: 0.002, decay: 0.12 * d, gain: 0.48 * g }),
      );
      sources.push(playPitchSweep(ctx, { destination, now, freqStart: randRange(400, 900), freqEnd: randRange(150, 300), attack: 0.001, decay: 0.08 * d, gain: 0.28 * g }));
      break;
    }
    case 'lava': {
      sources.push(playPitchSweep(ctx, { destination, now, freqStart: randRange(150, 260), freqEnd: randRange(60, 110), attack: 0.004, decay: 0.18 * d, gain: 0.45 * g }));
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'lowpass', freq: randRange(1000, 2000), q: 0.6, attack: 0.01, decay: 0.2 * d, gain: 0.25 * g }),
      );
      break;
    }
    // Fase 7.5 (abismo): el sculk suena blando y húmedo (un chasquido pegajoso que se hunde).
    case 'sculk': {
      sources.push(
        playNoiseBurst(ctx, { buffer: noise.brown, destination, now, filterType: 'lowpass', freq: randRange(500, 900), q: 1.4, attack: 0.004, decay: 0.12 * d, gain: 0.55 * g }),
      );
      sources.push(playPitchSweep(ctx, { destination, now, freqStart: randRange(260, 420), freqEnd: randRange(90, 140), attack: 0.002, decay: 0.09 * d, gain: 0.26 * g }));
      sources.push(
        playNoiseBurst(ctx, {
          buffer: noise.white, destination, now: now + randRange(0.02, 0.05), filterType: 'bandpass', freq: randRange(1600, 2600), q: 6,
          attack: 0.001, decay: 0.025, gain: 0.12 * g,
        }),
      );
      break;
    }
    default:
      if (buildNetherMaterial(ctx, noise, material, g, d, destination, now, sources)) break; // Fase 8.2 (biomas del Nether)
      sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'lowpass', freq: 800, attack: 0.004, decay: 0.08 * d, gain: 0.4 * g }));
  }

  // El aterrizaje suma siempre un golpe grave para vender el impacto, sea cual sea el material.
  if (kind === 'land') {
    sources.push(
      playTonalBlip(ctx, { destination, now, freq: randRange(50, 90), wave: 'sine', attack: 0.002, decay: 0.15 + 0.2 * clamp01(energy), gain: 0.5 * g }),
    );
  }

  return sources;
}

/** Chapoteo al entrar en el agua: golpe inicial + burbuja + gotas dispersas. */
export function buildSplashSound(ctx: AudioContext, noise: NoiseBuffers, intensity: number, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const e = clamp01(intensity);
  const sources: AudioScheduledSourceNode[] = [];

  sources.push(
    playNoiseBurst(ctx, {
      buffer: noise.white,
      destination,
      now,
      filterType: 'bandpass',
      freq: randRange(500, 1000) * (0.6 + e * 0.6),
      freqEnd: randRange(200, 400),
      q: 1,
      attack: 0.002,
      decay: 0.18 + 0.25 * e,
      gain: 0.35 + 0.5 * e,
    }),
  );
  sources.push(playPitchSweep(ctx, { destination, now, freqStart: randRange(500, 900), freqEnd: randRange(150, 260), attack: 0.002, decay: 0.15 + 0.2 * e, gain: 0.3 + 0.3 * e }));

  const droplets = 2 + Math.floor(e * 5 + Math.random() * 2);
  for (let i = 0; i < droplets; i++) {
    const t = now + randRange(0.05, 0.35 + 0.3 * e);
    sources.push(
      playPitchSweep(ctx, { destination, now: t, freqStart: randRange(900, 1800), freqEnd: randRange(300, 600), attack: 0.001, decay: randRange(0.04, 0.09), gain: 0.12 + 0.15 * e }),
    );
  }
  if (e > 0.5) {
    sources.push(playTonalBlip(ctx, { destination, now, freq: randRange(60, 100), wave: 'sine', attack: 0.004, decay: 0.2 + 0.2 * e, gain: 0.25 * e }));
  }
  return sources;
}

/** Pequeños sonidos sintetizados para la interfaz. */
export function buildUiSound(ctx: AudioContext, kind: UiKind, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  switch (kind) {
    case 'click':
      sources.push(playTonalBlip(ctx, { destination, now, freq: 1500, freqEnd: 1100, wave: 'square', attack: 0.001, decay: 0.03, gain: 0.18 }));
      break;
    case 'open':
      sources.push(playTonalBlip(ctx, { destination, now, freq: 420, freqEnd: 880, wave: 'triangle', attack: 0.004, decay: 0.09, gain: 0.22 }));
      break;
    case 'close':
      sources.push(playTonalBlip(ctx, { destination, now, freq: 880, freqEnd: 380, wave: 'triangle', attack: 0.004, decay: 0.09, gain: 0.2 }));
      break;
    case 'chat':
      sources.push(playTonalBlip(ctx, { destination, now, freq: 720, wave: 'sine', attack: 0.002, decay: 0.05, gain: 0.2 }));
      sources.push(playTonalBlip(ctx, { destination, now: now + 0.045, freq: 960, wave: 'sine', attack: 0.002, decay: 0.06, gain: 0.18 }));
      break;
    case 'join': {
      const notes = [523.25, 659.25, 783.99];
      for (let i = 0; i < notes.length; i++) {
        sources.push(playTonalBlip(ctx, { destination, now: now + i * 0.07, freq: notes[i], wave: 'sine', attack: 0.003, decay: 0.14, gain: 0.16 }));
      }
      break;
    }
    case 'leave': {
      const notes = [783.99, 659.25, 523.25];
      for (let i = 0; i < notes.length; i++) {
        sources.push(playTonalBlip(ctx, { destination, now: now + i * 0.07, freq: notes[i], wave: 'sine', attack: 0.003, decay: 0.14, gain: 0.16 }));
      }
      break;
    }
    case 'portal': {
      // Fase 8: el viaje por un portal: un zumbido que sube y se abre en voces desafinadas.
      const base = [110, 164.8, 220, 277.2, 329.6];
      for (let i = 0; i < base.length; i++) {
        const f = base[i] * (1 + (i % 2 ? 0.006 : -0.004));
        sources.push(playTonalBlip(ctx, { destination, now: now + i * 0.05, freq: f, freqEnd: f * 3.2, wave: i % 2 ? 'sawtooth' : 'sine', attack: 0.25, decay: 1.6, gain: i % 2 ? 0.035 : 0.09 }));
      }
      break;
    }
    default:
      sources.push(playTonalBlip(ctx, { destination, now, freq: 600, wave: 'sine', attack: 0.002, decay: 0.05, gain: 0.15 }));
  }
  return sources;
}
