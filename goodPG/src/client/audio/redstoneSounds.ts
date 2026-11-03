// Fase 7 (redstone): sonidos sintetizados de la redstone. Chasquidos de palancas, botones, placas,
// repetidores y comparadores (más agudos al encender, como en Minecraft), el tensado y el disparo del
// gancho de cuerda, el clic metálico de la bombilla de cobre, puertas y trampillas que abre la
// potencia (madera o hierro), el chisporroteo de una antorcha que se funde, las chispas del pararrayos
// y los 16 instrumentos del bloque musical (2 octavas, del fa sostenido al fa sostenido).
import { playInharmonicRing, playNoiseBurst, playTonalBlip, scheduleEnvelope } from './dsp';
import type { NoiseBuffers } from './noise';
import { randRange } from './types';

type Sources = AudioScheduledSourceNode[];

/** Chasquido de mecanismo: golpe de ruido y un tono corto (`hi`: más agudo, al encender). */
function click(ctx: AudioContext, noise: NoiseBuffers, dest: AudioNode, now: number, freq: number, hi: boolean, gain = 0.3): Sources {
  const k = hi ? 1.2 : 1;
  return [
    playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: freq * 3 * k, q: 2.5, attack: 0.001, decay: 0.035, gain }),
    playTonalBlip(ctx, { destination: dest, now, freq: freq * k, freqEnd: freq * k * 0.8, wave: 'triangle', attack: 0.001, decay: 0.05, gain: gain * 0.5 }),
  ];
}

/** Frecuencia de la nota n (0..24) de un instrumento con `octave` octavas respecto al arpa (fa# 3). */
const noteFreq = (n: number, octave: number) => 185 * Math.pow(2, n / 12 + octave);

/** Filtro paso bajo intermedio (para los timbres de cuerda y el didgeridoo). */
function lowpass(ctx: AudioContext, dest: AudioNode, freq: number, q = 1): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

/** Una nota del bloque musical: `inst` es el índice de INSTRUMENTS (shared/redstone/components.ts). */
function note(ctx: AudioContext, noise: NoiseBuffers, inst: number, n: number, dest: AudioNode, now: number): Sources {
  const blip = (freq: number, wave: OscillatorType, attack: number, decay: number, gain: number, to: AudioNode = dest, freqEnd?: number) =>
    playTonalBlip(ctx, { destination: to, now, freq, freqEnd, wave, attack, decay, gain });
  switch (inst) {
    case 1: { // bombo
      return [
        blip(120, 'sine', 0.002, 0.25, 0.5, dest, 45),
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 400, attack: 0.001, decay: 0.08, gain: 0.3 }),
      ];
    }
    case 2: // caja
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: 1800 * Math.pow(2, n / 24), q: 0.9, attack: 0.001, decay: 0.14, gain: 0.35 }),
        blip(220 * Math.pow(2, n / 24), 'triangle', 0.001, 0.06, 0.15),
      ];
    case 3: // platillo cerrado (clics)
      return [playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 5000 + n * 120, q: 0.7, attack: 0.001, decay: 0.05, gain: 0.25 })];
    case 4: { // contrabajo
      const f = noteFreq(n, -2);
      return [blip(f, 'triangle', 0.005, 0.5, 0.5), blip(f * 2, 'sine', 0.004, 0.25, 0.15)];
    }
    case 5: { // flauta: ataque suave, tono puro con un soplo
      const f = noteFreq(n, 1);
      return [
        blip(f, 'sine', 0.06, 0.6, 0.3),
        blip(f * 2, 'sine', 0.06, 0.4, 0.05),
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: f * 2, q: 3, attack: 0.03, decay: 0.2, gain: 0.04 }),
      ];
    }
    case 6: // campana (dorada)
      return playInharmonicRing(ctx, { destination: dest, now, baseFreq: noteFreq(n, 2), partials: [1, 2, 2.76, 5.4], decay: 1.6, gain: 0.22 });
    case 7: { // guitarra: diente de sierra que se apaga filtrado
      const f = noteFreq(n, -1);
      const lp = lowpass(ctx, dest, f * 5, 0.8);
      lp.frequency.setValueAtTime(f * 8, now);
      lp.frequency.exponentialRampToValueAtTime(f * 2, now + 0.5);
      return [blip(f, 'sawtooth', 0.003, 0.7, 0.25, lp), blip(f * 1.002, 'triangle', 0.003, 0.6, 0.15)];
    }
    case 8: // carillón
      return playInharmonicRing(ctx, { destination: dest, now, baseFreq: noteFreq(n, 2), partials: [1, 3.01, 4.9, 7.1], decay: 2.2, gain: 0.16 });
    case 9: { // xilófono: madera, corto
      const f = noteFreq(n, 2);
      return [blip(f, 'sine', 0.001, 0.2, 0.35), blip(f * 3.93, 'sine', 0.001, 0.05, 0.1)];
    }
    case 10: { // vibráfono de hierro
      const f = noteFreq(n, 0);
      return [blip(f, 'sine', 0.002, 0.9, 0.3), blip(f * 4, 'sine', 0.002, 0.25, 0.08), blip(f * 2, 'triangle', 0.002, 0.4, 0.06)];
    }
    case 11: { // cencerro
      const f = noteFreq(n, 1);
      return [blip(f, 'square', 0.001, 0.22, 0.12), blip(f * 1.48, 'square', 0.001, 0.18, 0.09)];
    }
    case 12: { // didgeridoo: zumbido grave que vibra
      const f = noteFreq(n, -2);
      const lp = lowpass(ctx, dest, f * 4, 6);
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 7;
      depth.gain.value = f * 1.5;
      lfo.connect(depth).connect(lp.frequency);
      lfo.start(now);
      lfo.stop(now + 1);
      return [blip(f, 'sawtooth', 0.02, 0.8, 0.4, lp), lfo];
    }
    case 13: { // bit: onda cuadrada de videojuego
      const f = noteFreq(n, 0);
      return [blip(f, 'square', 0.002, 0.35, 0.12)];
    }
    case 14: { // banjo: cuerda brillante y seca
      const f = noteFreq(n, 0);
      return [blip(f, 'sawtooth', 0.001, 0.25, 0.18), blip(f * 2, 'triangle', 0.001, 0.12, 0.1)];
    }
    case 15: { // piano eléctrico
      const f = noteFreq(n, 0);
      const mod = ctx.createOscillator();
      const mg = ctx.createGain();
      mod.frequency.value = f * 2;
      scheduleEnvelope(mg.gain, now, 0.002, f * 1.2, 0.5);
      const car = blip(f, 'sine', 0.002, 0.9, 0.3);
      mod.connect(mg).connect(car.frequency);
      mod.start(now);
      mod.stop(now + 1.1);
      return [car, mod];
    }
    default: { // arpa: pulsación limpia
      const f = noteFreq(n, 0);
      return [blip(f, 'triangle', 0.002, 0.8, 0.3), blip(f * 2, 'sine', 0.002, 0.35, 0.1), blip(f * 3, 'sine', 0.001, 0.12, 0.04)];
    }
  }
}

export function buildRedstoneSfx(
  ctx: AudioContext, noise: NoiseBuffers, kind: string, a: number, b: number, dest: AudioNode, now: number,
): Sources {
  switch (kind) {
    case 'lever':
      return click(ctx, noise, dest, now, 520, a === 1, 0.32);
    case 'button':
      // b = 1 madera (más sordo), 0 piedra.
      return click(ctx, noise, dest, now, b === 1 ? 380 : 560, a === 1, 0.3);
    case 'plate':
      // b: 0 piedra, 1 madera, 2 metal.
      return click(ctx, noise, dest, now, b === 1 ? 300 : b === 2 ? 700 : 420, a === 1, 0.28);
    case 'repeater':
    case 'comparator':
      return click(ctx, noise, dest, now, 640, a === 1, 0.25);
    case 'tripwire':
      // a: 1 se activa, 0 se desactiva, 2 se tensa, 3 se suelta.
      if (a >= 2) {
        return [
          playTonalBlip(ctx, { destination: dest, now, freq: a === 2 ? 320 : 480, freqEnd: a === 2 ? 520 : 300, wave: 'triangle', attack: 0.004, decay: 0.12, gain: 0.14 }),
          ...click(ctx, noise, dest, now, 700, a === 2, 0.16),
        ];
      }
      return click(ctx, noise, dest, now, 760, a === 1, 0.24);
    case 'bulb':
      return [
        ...click(ctx, noise, dest, now, 900, a === 1, 0.2),
        ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: a === 1 ? 1400 : 1150, partials: [1, 2.7, 5.1], decay: 0.25, gain: 0.05 }),
      ];
    case 'openable': {
      // a: 1 abre; b: bit 0 metal, bits 1-2: 0 puerta, 1 trampilla, 2 portillo.
      const metal = (b & 1) === 1, small = b >> 1 !== 0;
      if (metal) {
        return [
          playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'bandpass', freq: a ? 1400 : 1000, q: 1.5, attack: 0.004, decay: 0.2, gain: 0.25 }),
          ...playInharmonicRing(ctx, { destination: dest, now, baseFreq: small ? 330 : 220, partials: [1, 2.3, 3.9], decay: 0.4, gain: 0.08 }),
        ];
      }
      return [
        playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: small ? 1400 : 900, q: 0.8, attack: 0.01, decay: 0.16, gain: 0.35 }),
        playTonalBlip(ctx, { destination: dest, now, freq: a ? 190 : 150, freqEnd: a ? 150 : 110, wave: 'triangle', attack: 0.004, decay: 0.12, gain: 0.12 }),
      ];
    }
    case 'torch_burnout':
      return [
        playNoiseBurst(ctx, { buffer: noise.white, destination: dest, now, filterType: 'highpass', freq: 2500, freqEnd: 5000, q: 0.7, attack: 0.01, decay: 0.45, gain: 0.3 }),
        playNoiseBurst(ctx, { buffer: noise.pink, destination: dest, now: now + 0.05, filterType: 'bandpass', freq: 1200, q: 1, attack: 0.02, decay: 0.3, gain: 0.12 }),
      ];
    case 'rod_spark': {
      const out: Sources = [];
      for (let k = 0; k < 5; k++) {
        out.push(playNoiseBurst(ctx, {
          buffer: noise.white, destination: dest, now: now + k * randRange(0.03, 0.09), filterType: 'highpass', freq: randRange(3000, 6000), q: 1,
          attack: 0.001, decay: 0.03, gain: 0.2,
        }));
      }
      return out;
    }
    case 'target':
      return [playNoiseBurst(ctx, { buffer: noise.brown, destination: dest, now, filterType: 'lowpass', freq: 700, q: 0.8, attack: 0.002, decay: 0.1, gain: 0.35 })];
    case 'note':
      return note(ctx, noise, a, b, dest, now);
  }
  return [];
}
