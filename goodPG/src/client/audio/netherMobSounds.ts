// Fase 8.3 (criaturas del Nether): voces sintetizadas de las criaturas del Nether (mismas primitivas que
// wildlife.ts), con las variantes que manda el servidor según lo que hacen (como las elige Java:
// PiglinAi.getSoundForActivity, HoglinAi, Zoglin, Strider…).
// - Piglin: gruñidos nasales; enfadado, más roncos; huyendo, chillidos; admirando el oro, un «ooh» que sube;
//   celoso (ve oro en tu mano), un refunfuño; celebrando, gritos alegres. El bruto, más grave. El zombificado,
//   gorgoteos (enfadado, un bufido agudo).
// - Ghast: gemido fantasmal; al ir a disparar, un chillido agudo; el disparo, la bola que sale silbando.
// - Blaze: respiración entrecortada con chisporroteo; disparo, bufido de fuego; golpe, chasquido metálico.
// - Cubo de magma: «blorp» al saltar y chapoteo al caer (los pequeños, más agudos).
// - Hoglin: gruñidos graves; enfadado, un bramido; huyendo, un chillido. Zoglin: más ronco y áspero.
// - Strider: trinos cortos; contento, gorjeos; asustado, chirridos rápidos.
// - Esqueleto wither: traqueteo de huesos con una voz hueca.
import { playNoiseBurst, playPitchSweep, playTonalBlip } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange, type MobSoundEvent, type MobSoundKind } from './types';
import { voice, step, series } from './wildlife';

type Sources = AudioScheduledSourceNode[];

/** Variantes de voz (las mismas que usa el servidor en nvoice). */
export const NV_AMBIENT = 0;
export const NV_ANGRY = 1;
export const NV_RETREAT = 2;
export const NV_ADMIRING = 3;
export const NV_JEALOUS = 4;
export const NV_CELEBRATE = 5;

// ---------------------------------------------------------------------------------- piglins

function snort(ctx: AudioContext, noise: NoiseBuffers, d: AudioNode, t: number, f: number, g: number): Sources {
  return [
    playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: randRange(700, 950), q: 3, attack: 0.01, decay: 0.12, gain: g * 0.7 }),
    ...voice(ctx, d, t, { freq: f, freqEnd: f * 0.8, dur: 0.12, gain: g, vibratoRate: 30, vibratoDepth: 0.12, formant: f * 3.2, q: 3, attack: 0.015 }),
  ];
}

function piglinVoice(ctx: AudioContext, noise: NoiseBuffers, d: AudioNode, now: number, variant: number, k: number, zombified: boolean): Sources {
  const f = (v: number) => v * k * randRange(0.92, 1.08);
  if (zombified) {
    const gurgle = (t: number, base: number, g: number) => [
      ...voice(ctx, d, t, { freq: base, freqEnd: base * 0.75, dur: 0.35, gain: g, vibratoRate: 9, vibratoDepth: 0.18, formant: base * 2.6, q: 2.5, attack: 0.04 }),
      playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now: t, filterType: 'bandpass', freq: randRange(300, 450), q: 1.6, attack: 0.03, decay: 0.3, gain: g * 0.5 }),
    ];
    if (variant === NV_ANGRY) return [...snort(ctx, noise, d, now, f(380), 0.26), ...gurgle(now + 0.1, f(260), 0.2)];
    return gurgle(now, f(170), 0.2);
  }
  switch (variant) {
    case NV_ANGRY:
      return series(2, 0.12, 0.18, now, (t) => [
        ...voice(ctx, d, t, { freq: f(150), freqEnd: f(120), dur: 0.22, gain: 0.28, vibratoRate: 24, vibratoDepth: 0.2, formant: f(520), q: 2, attack: 0.02 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: 600, q: 1.5, attack: 0.02, decay: 0.2, gain: 0.18 }),
      ]);
    case NV_RETREAT:
      return series(2, 0.1, 0.16, now, (t) => voice(ctx, d, t, { freq: f(420), freqEnd: f(300), dur: 0.16, gain: 0.2, vibratoRate: 14, vibratoDepth: 0.06, formant: f(1100), q: 4, attack: 0.01 }));
    case NV_ADMIRING:
      return voice(ctx, d, now, { freq: f(210), freqEnd: f(330), dur: 0.55, gain: 0.2, vibratoRate: 6, vibratoDepth: 0.05, formant: f(700), q: 5, attack: 0.08 });
    case NV_JEALOUS:
      return series(2, 0.16, 0.22, now, (t) => voice(ctx, d, t, { freq: f(200), freqEnd: f(160), dur: 0.2, gain: 0.18, vibratoRate: 10, vibratoDepth: 0.08, formant: f(560), q: 3, attack: 0.03 }));
    case NV_CELEBRATE:
      return series(3, 0.12, 0.2, now, (t, i) => voice(ctx, d, t, { freq: f(260 + i * 50), freqEnd: f(380 + i * 40), dur: 0.16, gain: 0.2, vibratoRate: 12, vibratoDepth: 0.06, formant: f(900), q: 4, attack: 0.02 }));
    default:
      return series(1 + Math.floor(Math.random() * 2), 0.14, 0.24, now, (t) => snort(ctx, noise, d, t, f(190), 0.18));
  }
}

function piglinSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number, k: number, zombified: boolean): Sources {
  const f = (v: number) => v * k * randRange(0.92, 1.08);
  switch (ev) {
    case 'idle':
      return piglinVoice(ctx, noise, d, now, NV_AMBIENT, k, zombified);
    case 'hurt':
      return voice(ctx, d, now, { freq: f(zombified ? 360 : 460), freqEnd: f(300), dur: 0.2, gain: 0.28, vibratoRate: 18, vibratoDepth: 0.1, formant: f(1200), q: 3, attack: 0.01 });
    case 'death':
      return voice(ctx, d, now, { freq: f(330), freqEnd: f(110), dur: 0.9, gain: 0.3, vibratoRate: 10, vibratoDepth: 0.14, formant: f(800), q: 2.5, attack: 0.03 });
    case 'attack':
      return snort(ctx, noise, d, now, f(160), 0.26);
    case 'step':
      return [playTonalBlip(ctx, { destination: d, now, freq: randRange(140, 200), wave: 'triangle', attack: 0.002, decay: 0.05, gain: 0.08 }), ...step(ctx, noise, d, now, 0.3)];
    default:
      return snort(ctx, noise, d, now, f(190), 0.18);
  }
}

// ---------------------------------------------------------------------------------- ghast

function ghastSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent | 'warn', d: AudioNode, now: number): Sources {
  const moan = (f: number, dur: number, g: number) =>
    voice(ctx, d, now, { freq: f, freqEnd: f * 0.8, dur, gain: g, vibratoRate: 4.5, vibratoDepth: 0.06, formant: f * 2.2, q: 6, wave: 'triangle', attack: 0.25 });
  switch (ev) {
    case 'idle':
      return moan(randRange(260, 330), randRange(1.1, 1.6), 0.22);
    case 'warn':
      // El chillido de aviso (el «llanto» del ghast antes de disparar).
      return voice(ctx, d, now, { freq: randRange(760, 880), freqEnd: randRange(1100, 1300), dur: 0.5, gain: 0.26, vibratoRate: 11, vibratoDepth: 0.08, formant: 1800, q: 4, wave: 'triangle', attack: 0.05 });
    case 'shoot':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'lowpass', freq: 400, freqEnd: 2200, q: 1, attack: 0.02, decay: 0.45, gain: 0.3 }),
        playPitchSweep(ctx, { destination: d, now, freqStart: 180, freqEnd: 70, attack: 0.005, decay: 0.3, gain: 0.25 }),
      ];
    case 'hurt':
      return voice(ctx, d, now, { freq: 900, freqEnd: 600, dur: 0.35, gain: 0.26, vibratoRate: 16, vibratoDepth: 0.1, formant: 1600, q: 4, wave: 'triangle', attack: 0.02 });
    case 'death':
      return voice(ctx, d, now, { freq: 700, freqEnd: 180, dur: 1.6, gain: 0.3, vibratoRate: 6, vibratoDepth: 0.12, formant: 1200, q: 3, wave: 'triangle', attack: 0.05 });
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------- blaze

function blazeSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const crackle = (n: number, g: number) => series(n, 0.02, 0.07, now, (t) =>
    [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: t, filterType: 'highpass', freq: randRange(2500, 4500), q: 0.8, attack: 0.001, decay: 0.02, gain: g })]);
  switch (ev) {
    case 'idle':
      // Respiración: dos bocanadas de ruido filtrado y chasquidos.
      return [
        ...series(2, 0.35, 0.5, now, (t) => [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now: t, filterType: 'bandpass', freq: randRange(500, 800), q: 1.2, attack: 0.12, decay: 0.3, gain: 0.16 })]),
        ...crackle(4, 0.06),
      ];
    case 'shoot':
      return [
        playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'lowpass', freq: 600, freqEnd: 2600, q: 1, attack: 0.01, decay: 0.3, gain: 0.26 }),
        ...crackle(3, 0.08),
      ];
    case 'hurt':
      return [playTonalBlip(ctx, { destination: d, now, freq: randRange(900, 1200), wave: 'square', attack: 0.002, decay: 0.12, gain: 0.12 }), ...crackle(5, 0.1)];
    case 'death':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'bandpass', freq: 900, freqEnd: 300, q: 1, attack: 0.02, decay: 1.2, gain: 0.28 }), ...crackle(10, 0.08)];
    case 'attack':
      return crackle(4, 0.12);
    default:
      return crackle(2, 0.05);
  }
}

// ---------------------------------------------------------------------------------- cubo de magma

function magmaSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number, small: boolean): Sources {
  const k = small ? 1.6 : 1;
  const blorp = (g: number) => [
    playPitchSweep(ctx, { destination: d, now, freqStart: 140 * k, freqEnd: 70 * k, attack: 0.005, decay: 0.2, gain: g }),
    playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now, filterType: 'lowpass', freq: 500 * k, q: 0.8, attack: 0.005, decay: 0.15, gain: g * 0.7 }),
  ];
  switch (ev) {
    case 'step': // al caer
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'bandpass', freq: 380 * k, q: 1.2, attack: 0.003, decay: 0.18, gain: 0.22 }), ...blorp(0.12)];
    case 'hurt':
      return [playPitchSweep(ctx, { destination: d, now, freqStart: 260 * k, freqEnd: 120 * k, attack: 0.005, decay: 0.2, gain: 0.22 })];
    case 'death':
      return [playPitchSweep(ctx, { destination: d, now, freqStart: 200 * k, freqEnd: 50 * k, attack: 0.01, decay: 0.5, gain: 0.24 }), ...blorp(0.15)];
    default:
      return blorp(0.2);
  }
}

// ---------------------------------------------------------------------------------- hoglin y zoglin

function hoglinVoice(ctx: AudioContext, noise: NoiseBuffers, d: AudioNode, now: number, variant: number, zoglin: boolean): Sources {
  const rasp = zoglin ? 0.35 : 0.15;
  const grunt = (t: number, f: number, g: number, dur = 0.22) => [
    ...voice(ctx, d, t, { freq: f, freqEnd: f * 0.8, dur, gain: g, vibratoRate: 28, vibratoDepth: 0.2, formant: f * 3, q: 2, attack: 0.02 }),
    playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now: t, filterType: 'bandpass', freq: randRange(250, 400), q: 1.2, attack: 0.02, decay: dur, gain: g * (0.5 + rasp) }),
  ];
  switch (variant) {
    case NV_ANGRY:
      return [...grunt(now, randRange(95, 115), 0.34, 0.5), ...grunt(now + 0.3, randRange(80, 95), 0.3, 0.3)];
    case NV_RETREAT:
      return series(2, 0.12, 0.18, now, (t) => voice(ctx, d, t, { freq: randRange(340, 420), freqEnd: 260, dur: 0.18, gain: 0.24, vibratoRate: 16, vibratoDepth: 0.1, formant: 900, q: 3, attack: 0.01 }));
    default:
      return series(1 + Math.floor(Math.random() * 2), 0.18, 0.3, now, (t) => grunt(t, randRange(105, 135), 0.24));
  }
}

function hoglinSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number, zoglin: boolean): Sources {
  switch (ev) {
    case 'idle':
      return hoglinVoice(ctx, noise, d, now, NV_AMBIENT, zoglin);
    case 'attack':
      return [...hoglinVoice(ctx, noise, d, now, NV_ANGRY, zoglin), playTonalBlip(ctx, { destination: d, now, freq: 70, wave: 'sine', attack: 0.002, decay: 0.2, gain: 0.3 })];
    case 'hurt':
      return voice(ctx, d, now, { freq: 300, freqEnd: 180, dur: 0.25, gain: 0.3, vibratoRate: 20, vibratoDepth: 0.15, formant: 800, q: 2.5, attack: 0.01 });
    case 'death':
      return voice(ctx, d, now, { freq: 220, freqEnd: 70, dur: 1, gain: 0.32, vibratoRate: 12, vibratoDepth: 0.15, formant: 600, q: 2, attack: 0.03 });
    case 'step':
      return step(ctx, noise, d, now, 0.85);
    default:
      return hoglinVoice(ctx, noise, d, now, NV_AMBIENT, zoglin);
  }
}

// ---------------------------------------------------------------------------------- strider

function striderVoice(ctx: AudioContext, d: AudioNode, now: number, variant: number): Sources {
  const chirp = (t: number, f: number, g: number, dur: number) =>
    [playPitchSweep(ctx, { destination: d, now: t, freqStart: f, freqEnd: f * randRange(1.15, 1.4), attack: 0.004, decay: dur, gain: g, wave: 'sine' })];
  switch (variant) {
    case NV_ANGRY: // contento (tentado)
      return series(4, 0.05, 0.08, now, (t, i) => chirp(t, randRange(800, 950) + i * 60, 0.13, 0.06));
    case NV_RETREAT:
      return series(5, 0.03, 0.05, now, (t) => chirp(t, randRange(1000, 1200), 0.14, 0.04));
    default:
      return series(2 + Math.floor(Math.random() * 3), 0.06, 0.12, now, (t) => chirp(t, randRange(600, 850), 0.11, 0.07));
  }
}

function striderSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (ev) {
    case 'idle':
      return striderVoice(ctx, d, now, NV_AMBIENT);
    case 'hurt':
      return voice(ctx, d, now, { freq: 700, freqEnd: 480, dur: 0.18, gain: 0.24, vibratoRate: 20, vibratoDepth: 0.1, formant: 1500, q: 4, wave: 'triangle', attack: 0.01 });
    case 'death':
      return voice(ctx, d, now, { freq: 800, freqEnd: 200, dur: 0.8, gain: 0.26, vibratoRate: 14, vibratoDepth: 0.12, formant: 1200, q: 3, wave: 'triangle', attack: 0.02 });
    case 'step':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'lowpass', freq: 600, q: 0.8, attack: 0.004, decay: 0.12, gain: 0.14 })];
    default:
      return striderVoice(ctx, d, now, NV_AMBIENT);
  }
}

// ---------------------------------------------------------------------------------- esqueleto wither

function witherSkeletonSound(ctx: AudioContext, noise: NoiseBuffers, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  const rattle = (n: number, g: number) => series(n, 0.025, 0.05, now, (t) =>
    [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: t, filterType: 'bandpass', freq: randRange(1400, 2200), q: 5, attack: 0.001, decay: 0.03, gain: g })]);
  switch (ev) {
    case 'idle':
      return [...rattle(4, 0.1), ...voice(ctx, d, now, { freq: 110, freqEnd: 90, dur: 0.5, gain: 0.12, vibratoRate: 5, vibratoDepth: 0.05, formant: 330, q: 5, wave: 'triangle', attack: 0.1 })];
    case 'hurt':
      return rattle(6, 0.16);
    case 'death':
      return rattle(14, 0.14);
    case 'step':
      return rattle(2, 0.06);
    default:
      return rattle(3, 0.1);
  }
}

// ---------------------------------------------------------------------------------- entrada

/** Sonido de un evento de una criatura del Nether (lista vacía si el tipo no es de los suyos). */
export function buildNetherSound(ctx: AudioContext, noise: NoiseBuffers, kind: MobSoundKind, ev: MobSoundEvent, d: AudioNode, now: number): Sources {
  switch (kind) {
    case 'piglin': return piglinSound(ctx, noise, ev, d, now, 1, false);
    case 'piglin_brute': return piglinSound(ctx, noise, ev, d, now, 0.78, false);
    case 'zombified_piglin': return piglinSound(ctx, noise, ev, d, now, 1, true);
    case 'ghast': return ghastSound(ctx, noise, ev, d, now);
    case 'blaze': return blazeSound(ctx, noise, ev, d, now);
    case 'magma_cube': return magmaSound(ctx, noise, ev, d, now, false);
    case 'magma_cube_small': return magmaSound(ctx, noise, ev, d, now, true);
    case 'hoglin': return hoglinSound(ctx, noise, ev, d, now, false);
    case 'zoglin': return hoglinSound(ctx, noise, ev, d, now, true);
    case 'strider': return striderSound(ctx, noise, ev, d, now);
    case 'wither_skeleton': return witherSkeletonSound(ctx, noise, ev, d, now);
    default: return [];
  }
}

/** Voz con variante (la que manda el servidor con 'nvoice'). */
export function buildNetherVoice(ctx: AudioContext, noise: NoiseBuffers, kind: MobSoundKind, variant: number, d: AudioNode, now: number): Sources {
  switch (kind) {
    case 'piglin': return piglinVoice(ctx, noise, d, now, variant, 1, false);
    case 'piglin_brute': return piglinVoice(ctx, noise, d, now, variant, 0.78, false);
    case 'zombified_piglin': return piglinVoice(ctx, noise, d, now, variant, 1, true);
    case 'ghast': return ghastSound(ctx, noise, variant === 1 ? 'warn' : variant === 2 ? 'shoot' : 'idle', d, now);
    case 'blaze': return blazeSound(ctx, noise, variant === 2 ? 'shoot' : 'idle', d, now);
    case 'magma_cube': return magmaSound(ctx, noise, variant === 1 ? 'attack' : 'idle', d, now, false);
    case 'magma_cube_small': return magmaSound(ctx, noise, variant === 1 ? 'attack' : 'idle', d, now, true);
    case 'hoglin': return hoglinVoice(ctx, noise, d, now, variant, false);
    case 'zoglin': return hoglinVoice(ctx, noise, d, now, variant, true);
    case 'strider': return striderVoice(ctx, d, now, variant === 3 ? NV_ANGRY : variant);
    case 'wither_skeleton': return witherSkeletonSound(ctx, noise, 'idle', d, now);
    default: return [];
  }
}

/** Sonidos sueltos: ballesta (cargar, cargada, disparo), bola de fuego que da o se devuelve, conversión. */
export function buildNetherSfx(ctx: AudioContext, noise: NoiseBuffers, what: string, a: number, d: AudioNode, now: number): Sources {
  switch (what) {
    case 'crossbow':
      if (a === 0) return [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now, filterType: 'bandpass', freq: 1800, freqEnd: 2600, q: 3, attack: 0.05, decay: 0.5, gain: 0.08 })];
      if (a === 1) return [playTonalBlip(ctx, { destination: d, now, freq: 1600, wave: 'square', attack: 0.001, decay: 0.05, gain: 0.08 })];
      return [
        playTonalBlip(ctx, { destination: d, now, freq: 320, wave: 'triangle', attack: 0.001, decay: 0.12, gain: 0.2 }),
        playNoiseBurst(ctx, { buffer: noise.white, destination: d, now, filterType: 'highpass', freq: 2000, q: 0.7, attack: 0.002, decay: 0.08, gain: 0.12 }),
      ];
    case 'fireball_hit':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'bandpass', freq: 1200, freqEnd: 500, q: 1, attack: 0.005, decay: 0.3, gain: 0.2 })];
    case 'fireball_deflect':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination: d, now, filterType: 'lowpass', freq: 2500, freqEnd: 500, q: 1, attack: 0.005, decay: 0.25, gain: 0.26 })];
    case 'convert':
      return [
        ...voice(ctx, d, now, { freq: 240, freqEnd: 140, dur: 0.8, gain: 0.24, vibratoRate: 9, vibratoDepth: 0.2, formant: 700, q: 2.5, attack: 0.05 }),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: d, now, filterType: 'bandpass', freq: 400, q: 1.2, attack: 0.05, decay: 0.7, gain: 0.16 }),
      ];
    case 'boost':
      return series(3, 0.04, 0.06, now, (t, i) => [playPitchSweep(ctx, { destination: d, now: t, freqStart: 700 + i * 120, freqEnd: 1000 + i * 150, attack: 0.004, decay: 0.06, gain: 0.12 })]);
    case 'blaze_burn':
      return series(3, 0.02, 0.05, now, (t) => [playNoiseBurst(ctx, { buffer: noise.white, destination: d, now: t, filterType: 'highpass', freq: randRange(2200, 4200), q: 0.8, attack: 0.001, decay: 0.03, gain: 0.05 })]);
    default:
      return [];
  }
}
