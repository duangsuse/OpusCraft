// Sonidos de combate y supervivencia: golpes al jugador, comer, recoger objetos, explosiones,
// arco/flecha, picado de bloques, crafteo y el chisporroteo de un horno. Construido sobre las
// mismas primitivas de dsp.ts que materials.ts.
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { clamp, clamp01, randRange, type SoundMaterial } from './types';

/** Golpe corto tipo "oof": soplido de ropa + cuerpo vocal + golpe grave. */
export function buildPlayerHurt(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(2800, 4200), q: 0.5, attack: 0.001, decay: 0.04, gain: 0.14 }),
    playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'bandpass', freq: randRange(450, 700), q: 1.4, attack: 0.001, decay: 0.09, gain: 0.32 }),
    playTonalBlip(ctx, { destination, now, freq: randRange(130, 170), freqEnd: randRange(60, 85), wave: 'sine', attack: 0.001, decay: 0.14, gain: 0.5 }),
  ];
}

/** Golpe largo con tono descendente: el jugador cae derrotado. Siempre no posicional. */
export function buildPlayerDeath(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 3400, q: 0.5, attack: 0.001, decay: 0.06, gain: 0.14 }),
    playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'bandpass', freq: 500, q: 1.2, attack: 0.002, decay: 0.16, gain: 0.34 }),
    playTonalBlip(ctx, { destination, now, freq: 220, freqEnd: 45, wave: 'sine', attack: 0.002, decay: 0.7, gain: 0.5 }),
  ];
}

/** Ráfaga de mordisco crujiente: pensado para llamarse repetidamente mientras se come. */
export function buildEat(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const bites = 1 + Math.floor(Math.random() * 2);
  let t = now;
  for (let i = 0; i < bites; i++) {
    sources.push(
      playNoiseBurst(ctx, {
        buffer: noise.white,
        destination,
        now: t,
        filterType: 'bandpass',
        freq: randRange(900, 2200),
        q: randRange(2, 4),
        attack: 0.002,
        decay: randRange(0.05, 0.09),
        gain: randRange(0.22, 0.32),
        playbackRate: randRange(0.85, 1.25),
      }),
    );
    t += randRange(0.06, 0.1);
  }
  return sources;
}

/** Vocal grave corta: eructo al terminar de comer. */
export function buildBurp(ctx: AudioContext, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [playTonalBlip(ctx, { destination, now, freq: randRange(160, 200), freqEnd: randRange(80, 110), wave: 'sawtooth', attack: 0.01, decay: randRange(0.2, 0.3), gain: 0.28 })];
}

/** "Pop" suave con tono aleatorio: recogida de un objeto del suelo. */
export function buildPickup(ctx: AudioContext, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const start = randRange(500, 900);
  return [playPitchSweep(ctx, { destination, now, freqStart: start, freqEnd: start * randRange(1.6, 2.2), attack: 0.005, decay: randRange(0.06, 0.1), gain: randRange(0.22, 0.3), wave: 'sine' })];
}

/** Confirmación de crafteo: mini-arpegio brillante de dos notas. */
export function buildCraft(ctx: AudioContext, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const base = randRange(650, 750);
  return [
    playTonalBlip(ctx, { destination, now, freq: base, wave: 'triangle', attack: 0.002, decay: 0.06, gain: 0.2 }),
    playTonalBlip(ctx, { destination, now: now + 0.055, freq: base * 1.5, wave: 'triangle', attack: 0.002, decay: 0.1, gain: 0.22 }),
  ];
}

/** Chisporroteo de un horno encendido: 1-3 chasquidos y, a veces, un ascua grave. */
export function buildFurnaceCrackle(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const pops = 1 + Math.floor(Math.random() * 3);
  let t = now;
  for (let i = 0; i < pops; i++) {
    sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now: t, filterType: 'bandpass', freq: randRange(1500, 4000), q: randRange(3, 7), attack: 0.001, decay: randRange(0.02, 0.05), gain: randRange(0.08, 0.16) }));
    t += randRange(0.03, 0.09);
  }
  if (Math.random() < 0.4) {
    sources.push(playTonalBlip(ctx, { destination, now, freq: randRange(80, 130), wave: 'sine', attack: 0.01, decay: 0.12, gain: 0.1 }));
  }
  return sources;
}

/** Impacto corto de flecha en un bloque o criatura: "thock" grave + transitorio de asta. */
/** Barrido de la espada: un silbido de aire que baja y un roce metálico corto. */
export function buildSweep(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(2600, 3200), freqEnd: randRange(500, 700), q: 1.4, attack: 0.03, decay: 0.2, gain: 0.34 }),
    playNoiseBurst(ctx, { buffer: noise.pink, destination, now: now + 0.02, filterType: 'lowpass', freq: 900, freqEnd: 250, q: 0.7, attack: 0.02, decay: 0.16, gain: 0.2 }),
    ...playInharmonicRing(ctx, { destination, now: now + 0.01, baseFreq: randRange(1900, 2300), partials: [1, 1.41, 2.03], decay: 0.12, gain: 0.05 }),
  ];
}

/** Golpe corriendo (el de empuje): un golpe sordo más pesado. */
export function buildKnockbackHit(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.brown, destination, now, filterType: 'lowpass', freq: 700, freqEnd: 120, q: 0.8, attack: 0.002, decay: 0.16, gain: 0.5 }),
    playTonalBlip(ctx, { destination, now, freq: 120, freqEnd: 55, wave: 'sine', attack: 0.002, decay: 0.14, gain: 0.35 }),
  ];
}

export function buildArrowHit(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(900, 1700), q: 2, attack: 0.001, decay: 0.03, gain: 0.22 }),
    playTonalBlip(ctx, { destination, now, freq: randRange(180, 240), freqEnd: randRange(70, 100), wave: 'triangle', attack: 0.001, decay: 0.07, gain: 0.4 }),
  ];
}

/**
 * Tañido de cuerda de arco. `charge` 0..1 es la tensión al soltar (más tenso = chasquido más
 * agudo y ajustado); `volumeScale` permite reutilizar el mismo timbre, más discreto, para el
 * disparo de esqueletos/stray.
 */
export function buildBowTwang(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, charge: number, volumeScale = 1): AudioScheduledSourceNode[] {
  const c = clamp01(charge);
  const base = 220 + c * 160;
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(1400, 2400), q: randRange(3, 6), attack: 0.001, decay: 0.03 + 0.02 * (1 - c), gain: (0.16 + 0.14 * c) * volumeScale }),
    playTonalBlip(ctx, { destination, now, freq: 90, wave: 'sine', attack: 0.001, decay: 0.05, gain: 0.12 * volumeScale }),
    ...playInharmonicRing(ctx, { destination, now, baseFreq: base, partials: [1, 1.5, 2.2], decay: 0.1 + 0.08 * (1 - c), gain: (0.22 + 0.18 * c) * volumeScale }),
  ];
}

/** Explosión de creeper: estampido grave + cuerpo de ruido + crepitación de escombros, todo
 * dentro del margen del compresor maestro (potente pero sin llegar a recortar). `power` 1..4. */
export function buildExplosion(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, power: number): AudioScheduledSourceNode[] {
  const p = clamp(power, 1, 4) / 4; // 0.25..1
  const timed: { src: AudioScheduledSourceNode; end: number }[] = [];

  const boomDecay = 0.5 + 0.7 * p;
  const boom = playTonalBlip(ctx, { destination, now, freq: 90 - 25 * p, freqEnd: 28, wave: 'sine', attack: 0.006, decay: boomDecay, gain: 0.5 });
  timed.push({ src: boom, end: 0.006 + boomDecay });

  const bodyDecay = 0.6 + 0.8 * p;
  const body = playNoiseBurst(ctx, { buffer: noise.brown, destination, now, filterType: 'lowpass', freq: 500, freqEnd: 120, q: 0.7, attack: 0.004, decay: bodyDecay, gain: 0.55 });
  timed.push({ src: body, end: 0.004 + bodyDecay });

  const crack = playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 1500, q: 0.5, attack: 0.001, decay: 0.05, gain: 0.3 });
  timed.push({ src: crack, end: 0.001 + 0.05 });

  const debris = Math.round(6 + p * 10);
  for (let i = 0; i < debris; i++) {
    const offset = randRange(0.08, 0.35 + p * 1.1);
    const decay = randRange(0.04, 0.12);
    const gain = Math.max(0.02, randRange(0.05, 0.16) * (1 - i / (debris * 1.6)));
    const src = playNoiseBurst(ctx, { buffer: noise.pink, destination, now: now + offset, filterType: 'bandpass', freq: randRange(300, 1800), q: randRange(1, 3), attack: 0.002, decay, gain });
    timed.push({ src, end: offset + 0.002 + decay });
  }

  // Ordenar por instante de finalización: VoicePool solo engancha 'ended' al último elemento, así
  // que debe ser siempre el que más tarda en apagarse (si no, cortaría antes las colas más largas).
  timed.sort((a, b) => a.end - b.end);
  return timed.map((t) => t.src);
}

/** Tabla de picado por material: más corta y discreta que el golpe de rotura completo. */
interface TickProfile {
  type: BiquadFilterType;
  freq: readonly [number, number];
  q: number;
  buffer: keyof NoiseBuffers;
  tone?: number;
}

const TICK_PROFILES: Record<SoundMaterial, TickProfile> = {
  stone: { type: 'bandpass', freq: [900, 1900], q: 2.5, buffer: 'white', tone: 130 },
  wood: { type: 'bandpass', freq: [300, 500], q: 3, buffer: 'white', tone: 260 },
  grass: { type: 'highpass', freq: [1400, 2200], q: 0.6, buffer: 'white' },
  leaves: { type: 'highpass', freq: [2400, 3400], q: 0.5, buffer: 'white' },
  dirt: { type: 'lowpass', freq: [500, 900], q: 0.7, buffer: 'brown', tone: 90 },
  sand: { type: 'highpass', freq: [3400, 5000], q: 0.4, buffer: 'white' },
  gravel: { type: 'bandpass', freq: [1200, 3000], q: 3, buffer: 'white' },
  glass: { type: 'bandpass', freq: [2400, 3600], q: 4, buffer: 'white', tone: 2600 },
  snow: { type: 'lowpass', freq: [900, 1400], q: 0.5, buffer: 'pink' },
  wool: { type: 'lowpass', freq: [350, 650], q: 0.6, buffer: 'brown' },
  metal: { type: 'bandpass', freq: [1800, 3200], q: 5, buffer: 'white', tone: 520 },
  water: { type: 'bandpass', freq: [600, 1200], q: 1.2, buffer: 'white' },
  lava: { type: 'lowpass', freq: [800, 1400], q: 0.6, buffer: 'pink' },
  sculk: { type: 'lowpass', freq: [450, 800], q: 1.2, buffer: 'brown', tone: 110 }, // Fase 7.5 (abismo)
  // Fase 8.2 (biomas del Nether)
  netherrack: { type: 'bandpass', freq: [800, 1800], q: 2.4, buffer: 'white', tone: 100 },
  nether_ore: { type: 'bandpass', freq: [900, 2000], q: 2.8, buffer: 'white', tone: 120 },
  nether_bricks: { type: 'bandpass', freq: [1500, 2600], q: 3, buffer: 'white', tone: 170 },
  nether_wood: { type: 'bandpass', freq: [250, 420], q: 3, buffer: 'pink', tone: 200 },
  stem: { type: 'bandpass', freq: [700, 1300], q: 2.2, buffer: 'white', tone: 230 },
  nylium: { type: 'lowpass', freq: [900, 1400], q: 0.8, buffer: 'pink', tone: 95 },
  fungus: { type: 'lowpass', freq: [600, 1000], q: 1.2, buffer: 'brown' },
  roots: { type: 'highpass', freq: [1600, 2600], q: 0.6, buffer: 'white' },
  shroomlight: { type: 'lowpass', freq: [500, 800], q: 0.8, buffer: 'brown' },
  vines: { type: 'highpass', freq: [1800, 3000], q: 0.5, buffer: 'white' },
  soul_sand: { type: 'highpass', freq: [2600, 4200], q: 0.4, buffer: 'white' },
  soul_soil: { type: 'lowpass', freq: [350, 650], q: 0.9, buffer: 'brown', tone: 75 },
  basalt: { type: 'bandpass', freq: [600, 1200], q: 2.2, buffer: 'white', tone: 90 },
  wart: { type: 'lowpass', freq: [400, 750], q: 1.4, buffer: 'brown', tone: 100 },
  // Fase 8.5 (lo que da el Nether)
  ancient_debris: { type: 'bandpass', freq: [500, 1100], q: 2.2, buffer: 'pink', tone: 90 },
  netherite: { type: 'bandpass', freq: [1300, 2400], q: 4, buffer: 'white', tone: 380 },
  lodestone: { type: 'bandpass', freq: [1000, 2000], q: 3, buffer: 'white', tone: 260 },
};

/** Golpe de picado (minería): breve "tick/scrape", más suave y corto que `buildBreak`; pensado
 * para repetirse varias veces mientras se rompe un bloque. */
export function buildBlockHit(ctx: AudioContext, noise: NoiseBuffers, material: SoundMaterial, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const profile = TICK_PROFILES[material] ?? TICK_PROFILES.stone;
  const buf = noise[profile.buffer];
  const sources: AudioScheduledSourceNode[] = [
    playNoiseBurst(ctx, { buffer: buf, destination, now, filterType: profile.type, freq: randRange(profile.freq[0], profile.freq[1]), q: profile.q, attack: 0.001, decay: randRange(0.015, 0.03), gain: randRange(0.1, 0.16) }),
  ];
  if (profile.tone !== undefined) {
    sources.push(playTonalBlip(ctx, { destination, now, freq: profile.tone * randRange(0.9, 1.1), wave: 'triangle', attack: 0.001, decay: 0.02, gain: 0.08 }));
  }
  return sources;
}

/**
 * Trueno: chasquido seco (sólo si cae cerca), retumbo grave largo y rodadas de ruido que se
 * alejan. `delay` en segundos (la luz llega antes que el sonido) y `loud` 0..1 según la distancia.
 */
export function buildThunder(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, delay: number, loud: number): AudioScheduledSourceNode[] {
  const t0 = now + delay;
  const timed: { src: AudioScheduledSourceNode; end: number }[] = [];
  if (loud > 0.6) {
    const crack = playNoiseBurst(ctx, { buffer: noise.white, destination, now: t0, filterType: 'highpass', freq: 1200, q: 0.4, attack: 0.002, decay: 0.25, gain: 0.5 * loud });
    timed.push({ src: crack, end: delay + 0.25 });
  }
  const rumble = playNoiseBurst(ctx, { buffer: noise.brown, destination, now: t0, filterType: 'lowpass', freq: 260 + 300 * loud, freqEnd: 70, q: 0.6, attack: 0.05, decay: 3.2, gain: 0.7 * loud });
  timed.push({ src: rumble, end: delay + 3.25 });
  const boom = playTonalBlip(ctx, { destination, now: t0, freq: 55, freqEnd: 30, wave: 'sine', attack: 0.02, decay: 1.6, gain: 0.35 * loud });
  timed.push({ src: boom, end: delay + 1.62 });
  for (let i = 0; i < 5; i++) {
    const off = delay + 0.3 + i * randRange(0.25, 0.6);
    const d = randRange(0.5, 1.2);
    const src = playNoiseBurst(ctx, { buffer: noise.brown, destination, now: now + off, filterType: 'lowpass', freq: randRange(120, 300), q: 0.8, attack: 0.08, decay: d, gain: 0.3 * loud * (1 - i / 6) });
    timed.push({ src, end: off + d + 0.08 });
  }
  timed.sort((a, b) => a.end - b.end);
  return timed.map((t) => t.src);
}
