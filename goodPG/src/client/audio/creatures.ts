// Voces de criaturas para el modo supervivencia: cada tipo de mob tiene un timbre propio y
// reconocible, sintetizado (nunca muestreado) y aleatorizado en tono/tiempo para que las
// repeticiones no suenen idénticas. Construido sobre las mismas primitivas de dsp.ts que
// materials.ts; los timbres más particulares (formantes, vibrato) se montan aquí a mano con
// nodos crudos, igual que hacen ambience.ts y music.ts para sus propios instrumentos.
import { buildWitherVoice } from './witherSounds'; // Fase 8.7
import { playInharmonicRing, playNoiseBurst, playPitchSweep, playTonalBlip, scheduleEnvelope } from './dsp';
import { noiseOffset, noiseSource, type NoiseBuffers } from './noise';
import { buildBowTwang } from './combat';
import { randRange, type MobSoundEvent, type MobSoundKind } from './types';
import { villagerSound } from './villagerVoice'; // Fase 6 (aldeanos)
import { buildMonsterSound } from './monsterSounds'; // Fase 6 (monstruos)
import { buildIllagerSound } from './illagerSounds'; // Fase 6 (asaltos)
import { buildWildlifeSound } from './wildlife'; // Fase 6 (fauna)
import { buildGuardianSound } from './oceanSounds'; // Fase 7.5 (océano)
import { buildWardenSound } from './deepDarkSounds'; // Fase 7.5 (abismo)
import { buildCritterSound } from './critterSounds'; // Fase 7.5 (fauna)
import { buildNetherSound } from './netherMobSounds'; // Fase 8.3 (criaturas del Nether)
import { buildAllaySound } from './allaySounds'; // Fase 7.5 (mansión)

/** Paso ligero/pesado según el tamaño de la criatura: ruido grave con cuerpo tonal opcional. */
function playFootstep(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, weight: number): AudioScheduledSourceNode[] {
  const w = Math.max(0, Math.min(1, weight));
  const freq = 900 - 550 * w;
  const decay = 0.045 + 0.09 * w;
  const gain = 0.1 + 0.26 * w;
  const sources: AudioScheduledSourceNode[] = [
    playNoiseBurst(ctx, {
      buffer: noise.brown,
      destination,
      now,
      filterType: 'lowpass',
      freq: randRange(freq * 0.8, freq * 1.2),
      q: 0.7,
      attack: 0.002,
      decay: decay * randRange(0.85, 1.15),
      gain: gain * randRange(0.85, 1.15),
    }),
  ];
  if (w > 0.45) {
    sources.push(playTonalBlip(ctx, { destination, now, freq: randRange(55, 90), wave: 'sine', attack: 0.002, decay: decay * 0.8, gain: gain * 0.55 }));
  }
  return sources;
}

interface FormantVoiceOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  gain: number;
  vibratoRate: number;
  vibratoDepth?: number; // fracción de `freq`
  formantMult: number;
  formantQ: number;
  wave?: OscillatorType;
  attack?: number;
}

/** Voz animal genérica: oscilador con vibrato pasado por un filtro de banda ("formante") que le
 * da carácter vocal. Usada por vaca, oveja y enderman con parámetros muy distintos entre sí. */
function formantVoice(ctx: AudioContext, destination: AudioNode, now: number, o: FormantVoiceOpts): AudioScheduledSourceNode[] {
  const attack = o.attack ?? 0.06;
  const carrier = ctx.createOscillator();
  carrier.type = o.wave ?? 'sawtooth';
  carrier.frequency.setValueAtTime(Math.max(o.freq, 1), now);
  if (o.freqEnd !== undefined) {
    carrier.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), now + attack + o.dur);
  }

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = o.vibratoRate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = o.freq * (o.vibratoDepth ?? 0.03);
  lfo.connect(lfoGain).connect(carrier.frequency);

  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.value = o.freq * o.formantMult;
  formant.Q.value = o.formantQ;

  const amp = ctx.createGain();
  scheduleEnvelope(amp.gain, now, attack, o.gain, o.dur);
  carrier.connect(formant).connect(amp).connect(destination);

  const stopAt = now + attack + o.dur + 0.15;
  carrier.start(now);
  lfo.start(now);
  carrier.stop(stopAt);
  lfo.stop(stopAt);
  carrier.addEventListener(
    'ended',
    () => {
      try {
        lfo.disconnect();
        lfoGain.disconnect();
        formant.disconnect();
        amp.disconnect();
      } catch {
        /* ya desconectado */
      }
    },
    { once: true },
  );
  return [carrier, lfo];
}

// --- Cerdo: gruñidos/oinks nasales. ---
function pigOink(ctx: AudioContext, destination: AudioNode, now: number, sharp: boolean): AudioScheduledSourceNode[] {
  const base = sharp ? randRange(320, 420) : randRange(200, 300);
  return [playTonalBlip(ctx, { destination, now, freq: base, freqEnd: base * 0.65, wave: 'sawtooth', attack: 0.006, decay: sharp ? 0.09 : 0.14, gain: sharp ? 0.4 : 0.3 })];
}

function pigSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle': {
      const n = 1 + Math.floor(Math.random() * 2);
      const sources: AudioScheduledSourceNode[] = [];
      let t = now;
      for (let i = 0; i < n; i++) {
        sources.push(playNoiseBurst(ctx, { buffer: noise.pink, destination, now: t, filterType: 'bandpass', freq: randRange(350, 550), q: 1.8, attack: 0.004, decay: 0.08, gain: 0.16 }));
        sources.push(...pigOink(ctx, destination, t, false));
        t += randRange(0.14, 0.22);
      }
      return sources;
    }
    case 'hurt':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: 500, q: 1.5, attack: 0.002, decay: 0.07, gain: 0.2 }), ...pigOink(ctx, destination, now, true)];
    case 'death':
      return [...pigOink(ctx, destination, now, true), playTonalBlip(ctx, { destination, now: now + 0.05, freq: 260, freqEnd: 90, wave: 'sawtooth', attack: 0.004, decay: 0.32, gain: 0.32 })];
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.4);
    default:
      return pigOink(ctx, destination, now, false);
  }
}

// --- Vaca: mugido grave con vibrato. ---
function cowSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return formantVoice(ctx, destination, now, { freq: randRange(90, 120), dur: randRange(0.5, 0.9), gain: 0.34, vibratoRate: randRange(4.5, 6), vibratoDepth: 0.035, formantMult: 3.2, formantQ: 3, attack: 0.09 });
    case 'hurt':
      return formantVoice(ctx, destination, now, { freq: randRange(150, 190), dur: randRange(0.16, 0.26), gain: 0.36, vibratoRate: randRange(7, 9), formantMult: 2.8, formantQ: 3, attack: 0.02 });
    case 'death':
      return formantVoice(ctx, destination, now, { freq: randRange(130, 160), freqEnd: randRange(55, 80), dur: randRange(0.8, 1.1), gain: 0.36, vibratoRate: randRange(5, 6.5), formantMult: 3.2, formantQ: 3, attack: 0.08 });
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.85);
    default:
      return formantVoice(ctx, destination, now, { freq: 100, dur: 0.4, gain: 0.24, vibratoRate: 5, formantMult: 3.2, formantQ: 3 });
  }
}

// --- Oveja: balido agudo con vibrato rápido. ---
function sheepSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return formantVoice(ctx, destination, now, { freq: randRange(280, 360), dur: randRange(0.35, 0.55), gain: 0.3, vibratoRate: randRange(7, 9), vibratoDepth: 0.05, formantMult: 2.6, formantQ: 4, attack: 0.03 });
    case 'hurt':
      return formantVoice(ctx, destination, now, { freq: randRange(380, 460), dur: randRange(0.15, 0.25), gain: 0.32, vibratoRate: randRange(9, 11), vibratoDepth: 0.06, formantMult: 2.4, formantQ: 4, attack: 0.015 });
    case 'death':
      return formantVoice(ctx, destination, now, { freq: randRange(340, 400), freqEnd: randRange(150, 200), dur: randRange(0.5, 0.7), gain: 0.32, vibratoRate: randRange(6, 8), vibratoDepth: 0.05, formantMult: 2.6, formantQ: 4, attack: 0.02 });
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.38);
    default:
      return formantVoice(ctx, destination, now, { freq: 300, dur: 0.3, gain: 0.22, vibratoRate: 8, formantMult: 2.6, formantQ: 4 });
  }
}

// --- Gallina: cloqueos cortos, chillido agudo al recibir daño. ---
function chickenCluck(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(1400, 2400), q: randRange(2, 4), attack: 0.002, decay: randRange(0.03, 0.06), gain: randRange(0.16, 0.26) }),
    playTonalBlip(ctx, { destination, now, freq: randRange(900, 1300), freqEnd: randRange(500, 800), wave: 'square', attack: 0.001, decay: 0.03, gain: 0.12 }),
  ];
}

function chickenSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle': {
      const n = 1 + Math.floor(Math.random() * 3);
      const sources: AudioScheduledSourceNode[] = [];
      let t = now;
      for (let i = 0; i < n; i++) {
        sources.push(...chickenCluck(ctx, noise, destination, t));
        t += randRange(0.08, 0.16);
      }
      return sources;
    }
    case 'hurt':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: 2600, q: 1.5, attack: 0.003, decay: 0.12, gain: 0.28 }), playPitchSweep(ctx, { destination, now, freqStart: randRange(1200, 1600), freqEnd: randRange(2200, 3000), attack: 0.004, decay: 0.15, gain: 0.36 })];
    case 'death':
      return [playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'bandpass', freq: 1800, q: 1.2, attack: 0.004, decay: 0.28, gain: 0.22 }), playPitchSweep(ctx, { destination, now, freqStart: randRange(1800, 2400), freqEnd: randRange(500, 800), attack: 0.004, decay: 0.34, gain: 0.32 })];
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.1);
    default:
      return chickenCluck(ctx, noise, destination, now);
  }
}

// --- Zombie / husk: gruñido gutural (ruido filtrado + formante grave). El husk es más seco y áspero. ---
function undeadGroan(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, variant: 'zombie' | 'husk', dur: number, gain: number, pitchFall: boolean): AudioScheduledSourceNode[] {
  const dry = variant === 'husk';
  const buf = dry ? noise.white : noise.brown;
  const src = noiseSource(ctx, buf);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  const f0 = dry ? randRange(500, 750) : randRange(220, 340);
  filt.frequency.setValueAtTime(f0, now);
  filt.Q.value = dry ? randRange(2.5, 4) : randRange(1.2, 2);
  if (pitchFall) filt.frequency.exponentialRampToValueAtTime(f0 * 0.55, now + dur);
  const g = ctx.createGain();
  scheduleEnvelope(g.gain, now, 0.05, gain, dur);
  src.connect(filt).connect(g).connect(destination);
  const playDur = dur + 0.2;
  const offset = noiseOffset(buf, playDur);
  src.start(now, offset, playDur);
  src.stop(now + playDur + 0.05);
  src.addEventListener(
    'ended',
    () => {
      try {
        filt.disconnect();
        g.disconnect();
      } catch {
        /* ya desconectado */
      }
    },
    { once: true },
  );

  const formFreq = dry ? randRange(140, 190) : randRange(85, 130);
  const form = playTonalBlip(ctx, { destination, now, freq: formFreq, freqEnd: pitchFall ? formFreq * 0.6 : undefined, wave: 'sawtooth', attack: 0.04, decay: dur, gain: gain * 0.55 });

  const sources: AudioScheduledSourceNode[] = [form];
  if (dry) {
    sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 3000, q: 0.5, attack: 0.02, decay: dur * 0.6, gain: gain * 0.25 }));
  }
  sources.push(src); // el ruido filtrado siempre dura más: debe cerrar la voz.
  return sources;
}

function undeadSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number, variant: 'zombie' | 'husk'): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return undeadGroan(ctx, noise, destination, now, variant, randRange(0.5, 1.1), 0.22, false);
    case 'hurt':
      return undeadGroan(ctx, noise, destination, now, variant, randRange(0.14, 0.22), 0.34, false);
    case 'death':
      return undeadGroan(ctx, noise, destination, now, variant, randRange(0.9, 1.4), 0.32, true);
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.58);
    case 'attack':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(1500, 2200), q: 0.6, attack: 0.001, decay: 0.06, gain: 0.22 }), ...undeadGroan(ctx, noise, destination, now + 0.02, variant, 0.16, 0.28, false)];
    default:
      return undeadGroan(ctx, noise, destination, now, variant, 0.4, 0.2, false);
  }
}

// --- Esqueleto / stray: repiqueteo de huesos. El stray añade un siseo helado. ---
function boneClick(ctx: AudioContext, destination: AudioNode, now: number, freq: number): AudioScheduledSourceNode[] {
  return [playTonalBlip(ctx, { destination, now, freq, freqEnd: freq * 0.85, wave: 'square', attack: 0.001, decay: randRange(0.02, 0.04), gain: randRange(0.14, 0.22) })];
}

function boneSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number, variant: 'skeleton' | 'stray'): AudioScheduledSourceNode[] {
  const icy = variant === 'stray';
  switch (event) {
    case 'idle': {
      const n = 2 + Math.floor(Math.random() * 3);
      const sources: AudioScheduledSourceNode[] = [];
      let t = now;
      for (let i = 0; i < n; i++) {
        sources.push(...boneClick(ctx, destination, t, randRange(700, 1600)));
        t += randRange(0.05, 0.11);
      }
      if (icy) sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 4500, q: 0.4, attack: 0.03, decay: 0.5, gain: 0.1 }));
      return sources;
    }
    case 'hurt': {
      const n = 3 + Math.floor(Math.random() * 3);
      const sources: AudioScheduledSourceNode[] = [];
      let t = now;
      for (let i = 0; i < n; i++) {
        sources.push(...boneClick(ctx, destination, t, randRange(900, 2000)));
        t += randRange(0.025, 0.05);
      }
      return sources;
    }
    case 'death': {
      const n = 4 + Math.floor(Math.random() * 3);
      const sources: AudioScheduledSourceNode[] = [];
      let t = now;
      let freq = randRange(1400, 1800);
      for (let i = 0; i < n; i++) {
        sources.push(...boneClick(ctx, destination, t, freq));
        freq *= randRange(0.78, 0.9);
        t += randRange(0.06, 0.13) * (1 + i * 0.15);
      }
      if (icy) sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 4000, q: 0.4, attack: 0.05, decay: 0.7, gain: 0.12 }));
      return sources;
    }
    case 'step':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(1200, 2000), q: 2.5, attack: 0.001, decay: 0.035, gain: 0.14 })];
    case 'attack':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(1800, 2600), q: 0.6, attack: 0.001, decay: 0.05, gain: 0.2 }), ...boneClick(ctx, destination, now + 0.02, randRange(900, 1400))];
    case 'shoot':
      return buildBowTwang(ctx, noise, destination, now, 0.85, 0.75);
    default:
      return boneClick(ctx, destination, now, 1000);
  }
}

// --- Creeper: sin voz de reposo; el fuse es la pista de jugabilidad clave. ---
function creeperSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return []; // silencio intencionado (ver AudioEngine.playMob, que corta antes de llegar aquí)
    case 'fuse': {
      const dur = 1.5;
      const src = noiseSource(ctx, noise.white);
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(900, now);
      filt.frequency.exponentialRampToValueAtTime(4200, now + dur);
      filt.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.4, now + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.55, now + dur);
      src.connect(filt).connect(g).connect(destination);
      const offset = noiseOffset(noise.white, dur + 0.1);
      src.start(now, offset, dur + 0.1);
      src.stop(now + dur + 0.15);
      src.addEventListener(
        'ended',
        () => {
          try {
            filt.disconnect();
            g.disconnect();
          } catch {
            /* ya desconectado */
          }
        },
        { once: true },
      );
      const tone = playPitchSweep(ctx, { destination, now, freqStart: 1400, freqEnd: 2600, attack: dur * 0.6, decay: dur * 0.4, gain: 0.15 });
      return [tone, src];
    }
    case 'hurt':
      return [playTonalBlip(ctx, { destination, now, freq: 200, freqEnd: 120, wave: 'sawtooth', attack: 0.002, decay: 0.12, gain: 0.2 }), playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(1200, 2000), q: 3, attack: 0.002, decay: 0.1, gain: 0.28 })];
    case 'death':
      return [playTonalBlip(ctx, { destination, now, freq: 180, freqEnd: 70, wave: 'sawtooth', attack: 0.004, decay: 0.35, gain: 0.22 }), playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: randRange(1000, 1800), q: 3, attack: 0.002, decay: 0.3, gain: 0.26 })];
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.4);
    default:
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: 2000, q: 0.6, attack: 0.005, decay: 0.08, gain: 0.12 })];
  }
}

// --- Araña: chasquidos y siseos. ---
function spiderChitter(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  const n = 2 + Math.floor(Math.random() * 3);
  const sources: AudioScheduledSourceNode[] = [];
  let t = now;
  for (let i = 0; i < n; i++) {
    sources.push(playNoiseBurst(ctx, { buffer: noise.white, destination, now: t, filterType: 'highpass', freq: randRange(2500, 4500), q: randRange(1.5, 3), attack: 0.001, decay: randRange(0.015, 0.035), gain: randRange(0.12, 0.2) }));
    t += randRange(0.03, 0.07);
  }
  return sources;
}

function spiderSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return spiderChitter(ctx, noise, destination, now);
    case 'hurt':
      return [...spiderChitter(ctx, noise, destination, now), playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'bandpass', freq: 1800, q: 2, attack: 0.002, decay: 0.12, gain: 0.24 })];
    case 'death':
      return [...spiderChitter(ctx, noise, destination, now), playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'lowpass', freq: 900, q: 1, attack: 0.004, decay: 0.3, gain: 0.22 })];
    case 'step':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(2200, 3400), q: 2, attack: 0.001, decay: 0.025, gain: 0.1 })];
    case 'attack':
      return [...spiderChitter(ctx, noise, destination, now + 0.03), playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(2000, 3000), q: 1.2, attack: 0.001, decay: 0.06, gain: 0.24 })];
    default:
      return spiderChitter(ctx, noise, destination, now);
  }
}

// --- Enderman: vocalización "invertida" (ataque lento, corte brusco) y teletransporte "vwoop". ---
function endermanVoice(ctx: AudioContext, destination: AudioNode, now: number, dur: number, gain: number, freqEnd?: number): AudioScheduledSourceNode[] {
  return formantVoice(ctx, destination, now, {
    freq: randRange(500, 700),
    freqEnd,
    dur,
    gain,
    vibratoRate: randRange(2.5, 4),
    vibratoDepth: 0.12,
    formantMult: randRange(1.6, 2.2),
    formantQ: 8,
    wave: 'sawtooth',
    attack: dur * 0.6,
  });
}

function endermanSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'idle':
      return endermanVoice(ctx, destination, now, randRange(0.3, 0.5), 0.16);
    case 'hurt':
      return endermanVoice(ctx, destination, now, randRange(0.15, 0.25), 0.26, randRange(800, 1000));
    case 'death':
      return endermanVoice(ctx, destination, now, randRange(0.6, 0.9), 0.26, randRange(150, 250));
    case 'step':
      return playFootstep(ctx, noise, destination, now, 0.5);
    case 'attack':
      return [playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'highpass', freq: randRange(1600, 2400), q: 0.8, attack: 0.001, decay: 0.07, gain: 0.22 }), ...endermanVoice(ctx, destination, now + 0.02, 0.18, 0.2)];
    case 'teleport': {
      const up = playPitchSweep(ctx, { destination, now, freqStart: 300, freqEnd: 1600, attack: 0.09, decay: 0.05, gain: 0.3, wave: 'sine' });
      const down = playPitchSweep(ctx, { destination, now: now + 0.1, freqStart: 1500, freqEnd: 250, attack: 0.03, decay: 0.16, gain: 0.28, wave: 'sine' });
      const whoosh = playNoiseBurst(ctx, { buffer: noise.pink, destination, now, filterType: 'bandpass', freq: 700, freqEnd: 1800, q: 0.8, attack: 0.05, decay: 0.22, gain: 0.2 });
      return [up, down, whoosh]; // whoosh es el más largo: cierra la voz.
    }
    default:
      return endermanVoice(ctx, destination, now, 0.3, 0.16);
  }
}

// --- Calamar: chapoteo suave y burbujeante, siempre bajo el agua. ---
function squidSquelch(ctx: AudioContext, noise: NoiseBuffers, destination: AudioNode, now: number, sharp: boolean): AudioScheduledSourceNode[] {
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination, now, filterType: 'lowpass', freq: randRange(600, 1000), q: 0.8, attack: 0.01, decay: sharp ? 0.1 : 0.18, gain: sharp ? 0.18 : 0.14 }),
    playPitchSweep(ctx, { destination, now, freqStart: sharp ? randRange(500, 700) : randRange(250, 400), freqEnd: sharp ? randRange(150, 250) : randRange(500, 700), attack: 0.02, decay: sharp ? 0.12 : 0.22, gain: sharp ? 0.3 : 0.22, wave: 'sine' }),
  ];
}

function squidSound(ctx: AudioContext, noise: NoiseBuffers, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (event) {
    case 'hurt':
      return squidSquelch(ctx, noise, destination, now, true);
    case 'death':
      return [...squidSquelch(ctx, noise, destination, now, true), playPitchSweep(ctx, { destination, now: now + 0.05, freqStart: 400, freqEnd: 120, attack: 0.02, decay: 0.35, gain: 0.2, wave: 'sine' })];
    default:
      return squidSquelch(ctx, noise, destination, now, false);
  }
}

/**
 * Construye las fuentes de audio para un evento de sonido de criatura. `destination` es el nodo
 * al que conectarse (normalmente un PannerNode posicional creado por AudioEngine).
 */
export function buildMobSound(ctx: AudioContext, noise: NoiseBuffers, kind: MobSoundKind, event: MobSoundEvent, destination: AudioNode, now: number): AudioScheduledSourceNode[] {
  switch (kind) {
    case 'pig':
      return pigSound(ctx, noise, event, destination, now);
    case 'cow':
      return cowSound(ctx, noise, event, destination, now);
    case 'sheep':
      return sheepSound(ctx, noise, event, destination, now);
    case 'chicken':
      return chickenSound(ctx, noise, event, destination, now);
    case 'zombie':
      return undeadSound(ctx, noise, event, destination, now, 'zombie');
    case 'husk':
      return undeadSound(ctx, noise, event, destination, now, 'husk');
    case 'skeleton':
      return boneSound(ctx, noise, event, destination, now, 'skeleton');
    case 'stray':
      return boneSound(ctx, noise, event, destination, now, 'stray');
    case 'creeper':
      return creeperSound(ctx, noise, event, destination, now);
    case 'spider':
      return spiderSound(ctx, noise, event, destination, now);
    case 'enderman':
      return endermanSound(ctx, noise, event, destination, now);
    case 'squid':
      return squidSound(ctx, noise, event, destination, now);
    // Fase 6 (aldeanos)
    case 'villager':
    case 'wandering_trader':
      return villagerSound(ctx, noise, event, destination, now);
    case 'wither': // Fase 8.7
      return buildWitherVoice(ctx, noise, event, destination, now);
    default:
      // Fase 6 (monstruos): bruja, slime, phantom y lepisma; (fauna): zorro, cabra, oso polar, conejo, lobo,
      // abeja, panda, loro y armadillo.
      {
        const nether = buildNetherSound(ctx, noise, kind, event, destination, now); // Fase 8.3 (criaturas del Nether)
        if (nether.length) return nether;
        const guardian = buildGuardianSound(ctx, noise, kind, event, destination, now); // Fase 7.5 (océano)
        if (guardian.length || kind === 'guardian' || kind === 'elder_guardian') return guardian;
        if (kind === 'warden') return buildWardenSound(ctx, noise, kind, event, destination, now); // Fase 7.5 (abismo)
        const monster = buildMonsterSound(ctx, noise, kind, event, destination, now);
        if (monster.length) return monster;
        // Fase 6 (asaltos): illagers, vex y devastador.
        const raider = buildIllagerSound(ctx, noise, kind, event, destination, now);
        if (raider.length) return raider;
        if (kind === 'allay') return buildAllaySound(ctx, noise, kind, event, destination, now); // Fase 7.5 (mansión)
        // Fase 7.5 (fauna): murciélago, ocelote y caballos no muertos.
        const critter = buildCritterSound(ctx, noise, kind, event, destination, now);
        return critter.length ? critter : buildWildlifeSound(ctx, noise, kind, event, destination, now);
      }
  }
}
