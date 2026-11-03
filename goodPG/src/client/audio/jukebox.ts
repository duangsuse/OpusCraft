// Fase 6.5 (colecciones): los tocadiscos. Cada uno toca la partitura de su disco (discs.ts) con voces
// sintetizadas, en su posición (PannerNode: se oye hasta unos 64 bloques y más fuerte cuanto más cerca).
// Las notas se programan poco a poco (un par de segundos por delante del reloj de audio), así un disco
// de tres minutos no crea miles de nodos de golpe; y lejos del tocadiscos no se programa nada (al volver
// se sigue por donde iba).
import type { NoiseBuffers } from './noise';
import { noiseSource, noiseOffset } from './noise';
import { composeDisc, type NoteEvent, type Song } from './discs';
import { setPannerPosition } from './spatial';
import type { Vec3 } from './types';

/** Segundos que se programan por delante. */
const LOOKAHEAD = 1.5;
/** A partir de esta distancia no se oye (ni se programa). */
const HEAR_DISTANCE = 64;

type Sources = AudioScheduledSourceNode[];

/** Envolvente: sube en `a` segundos hasta `peak`, se mantiene hasta `hold` y cae en `r`. */
function envelope(g: AudioParam, t: number, a: number, peak: number, hold: number, r: number): void {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(0.002, a));
  if (hold > a) g.setValueAtTime(Math.max(peak, 0.0002), t + hold);
  g.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, a) + Math.max(0.01, r));
}

function osc(ctx: AudioContext, type: OscillatorType, f: number, t: number, end: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.value = detune;
  o.start(t);
  o.stop(end);
  return o;
}

/** Vibrato: un LFO que mueve la afinación (en cents) de los osciladores. */
function vibrato(ctx: AudioContext, targets: OscillatorNode[], t: number, end: number, rate: number, cents: number): OscillatorNode {
  const lfo = osc(ctx, 'sine', rate, t, end);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + 0.25);
  lfo.connect(depth);
  for (const o of targets) depth.connect(o.detune);
  return lfo;
}

/** Programa una nota y devuelve sus fuentes (la última avisa al terminar para limpiar). */
function playNote(ctx: AudioContext, noise: NoiseBuffers, out: AudioNode, e: NoteEvent, t: number): Sources {
  const v = e.v, f = e.f, d = e.d;
  const g = ctx.createGain();
  g.connect(out);
  const src: Sources = [];
  const tone = (type: OscillatorType, freq: number, end: number, detune = 0, level = 1, dest: AudioNode = g) => {
    const o = osc(ctx, type, freq, t, end, detune);
    if (level !== 1) {
      const lg = ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(dest);
    } else o.connect(dest);
    src.push(o);
    return o;
  };
  const filtered = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(freq, t);
    fl.Q.value = q;
    fl.connect(g);
    return fl;
  };
  const noiseHit = (buffer: AudioBuffer, type: BiquadFilterType, freq: number, len: number, q = 0.7, level = 1) => {
    const n = noiseSource(ctx, buffer);
    const fl = filtered(type, freq, q);
    if (level !== 1) {
      const lg = ctx.createGain();
      lg.gain.value = level;
      n.connect(lg).connect(fl);
    } else n.connect(fl);
    n.start(t, noiseOffset(buffer, len + 0.1), len + 0.05);
    n.stop(t + len + 0.1);
    src.push(n);
    return fl;
  };
  switch (e.i) {
    case 'piano':
    case 'woozy': {
      // Piano FM suave (como el de la música de fondo); el «desafinado» se tambalea un poco.
      const end = t + d + 0.5;
      const c = tone('sine', f, end);
      const m = osc(ctx, 'sine', f * 2.01, t, end);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 0.6 * v, t);
      mg.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      m.connect(mg).connect(c.frequency);
      src.unshift(m);
      tone('sine', f * 2, end, 0, 0.14);
      if (e.i === 'woozy') src.unshift(vibrato(ctx, [c], t, end, 4.2, 14));
      envelope(g.gain, t, 0.008, v, 0.02, d + 0.4);
      break;
    }
    case 'epiano': {
      const end = t + d + 0.4;
      const c = tone('sine', f, end);
      const m = osc(ctx, 'sine', f, t, end);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.2 * v, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
      m.connect(mg).connect(c.frequency);
      src.unshift(m);
      tone('sine', f * 4, t + 0.15, 0, 0.05);
      envelope(g.gain, t, 0.004, v, d * 0.5, d * 0.6 + 0.3);
      break;
    }
    case 'pluck': {
      const fl = filtered('lowpass', 4200, 1.5);
      fl.frequency.exponentialRampToValueAtTime(700, t + 0.35);
      tone('sawtooth', f, t + d + 0.3, 0, 1, fl);
      envelope(g.gain, t, 0.003, v * 0.8, 0.01, Math.min(0.6, d + 0.2));
      break;
    }
    case 'marimba':
      tone('sine', f, t + 0.6);
      tone('sine', f * 4, t + 0.1, 0, 0.18);
      envelope(g.gain, t, 0.002, v, 0.01, 0.45);
      break;
    case 'chip':
      tone('square', f, t + d + 0.1);
      envelope(g.gain, t, 0.004, v, d * 0.7, d * 0.3 + 0.03);
      break;
    case 'pad':
    case 'strings': {
      const fl = filtered('lowpass', e.i === 'pad' ? 1100 : 2600, 0.6);
      const end = t + d + 1.2;
      const a = tone('sawtooth', f, end, -7, 1, fl);
      const b = tone('sawtooth', f, end, 7, 1, fl);
      if (e.i === 'strings') src.unshift(vibrato(ctx, [a, b], t, end, 5, 8));
      envelope(g.gain, t, e.i === 'pad' ? Math.min(1.2, d * 0.4) : 0.25, v * 0.5, d, 0.9);
      break;
    }
    case 'organ':
      tone('sine', f, t + d + 0.2);
      tone('sine', f * 2, t + d + 0.2, 0, 0.5);
      tone('sine', f * 3, t + d + 0.2, 0, 0.2);
      envelope(g.gain, t, 0.03, v, d, 0.15);
      break;
    case 'bass': {
      const fl = filtered('lowpass', 700, 1);
      tone('triangle', f, t + d + 0.2, 0, 1, fl);
      tone('sine', f / 2, t + d + 0.2, 0, 0.6, fl);
      envelope(g.gain, t, 0.006, v, d * 0.6, d * 0.4 + 0.08);
      break;
    }
    case 'drone': {
      const fl = filtered('lowpass', 380, 0.9);
      fl.frequency.linearRampToValueAtTime(760, t + d / 2);
      fl.frequency.linearRampToValueAtTime(320, t + d);
      tone('sawtooth', f, t + d + 0.1, -5, 1, fl);
      tone('sine', f * 1.5, t + d + 0.1, 4, 0.5, fl);
      envelope(g.gain, t, Math.min(4, d / 3), v * 0.5, d - 3, 3);
      break;
    }
    case 'bell':
      for (const [ratio, lv] of [[1, 1], [2.76, 0.4], [5.4, 0.18], [0.5, 0.25]] as const) tone('sine', f * ratio, t + d + 0.2, 0, lv);
      envelope(g.gain, t, 0.003, v, 0.01, d);
      break;
    case 'lead': {
      const fl = filtered('lowpass', 2600, 2);
      const end = t + d + 0.2;
      const a = tone('square', f, end, 0, 0.6, fl);
      const b = tone('sawtooth', f, end, 6, 0.5, fl);
      src.unshift(vibrato(ctx, [a, b], t, end, 5.5, 10));
      envelope(g.gain, t, 0.01, v, d * 0.9, 0.12);
      break;
    }
    case 'sax': {
      // Diente de sierra por un filtro que se abre al soplar, con vibrato y algo de aire.
      const fl = filtered('lowpass', 900, 3);
      fl.frequency.linearRampToValueAtTime(2400, t + 0.08);
      fl.frequency.linearRampToValueAtTime(1500, t + d);
      const end = t + d + 0.2;
      const a = tone('sawtooth', f, end, 0, 1, fl);
      src.unshift(vibrato(ctx, [a], t, end, 5, 16));
      noiseHit(noise.pink, 'bandpass', f * 3, Math.min(0.3, d), 2, 0.25);
      envelope(g.gain, t, 0.04, v, d * 0.85, 0.15);
      break;
    }
    case 'flute': {
      const end = t + d + 0.3;
      const a = tone('sine', f, end);
      tone('triangle', f * 2, end, 0, 0.12);
      src.unshift(vibrato(ctx, [a], t, end, 4.8, 12));
      envelope(g.gain, t, 0.12, v, d * 0.9, 0.25);
      break;
    }
    case 'kick': {
      const o = tone('sine', 140, t + 0.4);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      envelope(g.gain, t, 0.002, v * 0.9, 0.02, 0.3);
      break;
    }
    case 'snare':
      noiseHit(noise.white, 'highpass', 1400, 0.18);
      tone('triangle', 190, t + 0.1, 0, 0.5);
      envelope(g.gain, t, 0.002, v * 0.5, 0.01, 0.16);
      break;
    case 'hat':
    case 'openhat': {
      const len = e.i === 'hat' ? 0.05 : 0.25;
      noiseHit(noise.white, 'highpass', 7200, len);
      envelope(g.gain, t, 0.001, v * 0.25, 0.005, len);
      break;
    }
    case 'rim':
      tone('square', 1700, t + 0.05, 0, 0.4);
      noiseHit(noise.white, 'bandpass', 2600, 0.03, 3);
      envelope(g.gain, t, 0.001, v * 0.3, 0.004, 0.04);
      break;
    case 'wind': {
      const fl = noiseHit(noise.pink, 'bandpass', f, d, 1.2);
      fl.frequency.linearRampToValueAtTime(f * 1.8, t + d / 2);
      fl.frequency.linearRampToValueAtTime(f * 0.7, t + d);
      envelope(g.gain, t, d * 0.4, v * 0.6, d * 0.5, d * 0.5);
      break;
    }
    case 'chirp': {
      const o = tone('sine', f, t + d + 0.02);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d * 0.7);
      envelope(g.gain, t, 0.004, v, 0.01, d);
      break;
    }
    case 'glitch': {
      const fl = filtered('lowpass', 1800, 4);
      const o = tone('square', f, t + d + 0.05, 0, 1, fl);
      o.frequency.setValueAtTime(f, t + d * 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + d);
      envelope(g.gain, t, 0.01, v, d * 0.3, d * 0.6);
      break;
    }
    case 'thud': {
      const o = tone('sine', f * 1.6, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      noiseHit(noise.brown, 'lowpass', 300, 0.1);
      envelope(g.gain, t, 0.002, v, 0.02, 0.25);
      break;
    }
    case 'crackle':
      noiseHit(noise.white, 'bandpass', f, 0.015, 4);
      envelope(g.gain, t, 0.0005, v, 0.002, 0.015);
      break;
    case 'clank':
      for (const ratio of [1, 2.43, 3.87, 5.1]) tone('square', f * ratio, t + d + 0.1, 0, 0.3 / ratio);
      noiseHit(noise.white, 'bandpass', 2400, 0.05, 2);
      envelope(g.gain, t, 0.002, v * 0.4, 0.01, d);
      break;
    case 'drip': {
      const o = tone('sine', f, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.08);
      envelope(g.gain, t, 0.002, v, 0.005, 0.12);
      break;
    }
  }
  // Cuando callan todas sus fuentes, fuera la nota.
  let left = src.length;
  if (!left) g.disconnect();
  for (const n of src) {
    n.addEventListener('ended', () => {
      if (--left === 0) g.disconnect();
    }, { once: true });
  }
  return src;
}

/** Un tocadiscos sonando. */
class DiscPlayer {
  private song: Song;
  private idx = 0;
  /** Momento (reloj de audio) en el que empezó el disco. */
  private start: number;
  private out: GainNode;
  private panner: PannerNode;
  private wet: GainNode;
  private live = new Set<AudioScheduledSourceNode>();
  done = false;

  constructor(private ctx: AudioContext, private noise: NoiseBuffers, dest: AudioNode, reverb: AudioNode, disc: number, private pos: Vec3, elapsed: number) {
    this.song = composeDisc(disc);
    this.start = ctx.currentTime - elapsed + 0.05;
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'linear';
    this.panner.refDistance = 4;
    this.panner.maxDistance = HEAR_DISTANCE;
    this.panner.rolloffFactor = 1;
    setPannerPosition(this.panner, pos);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.out.connect(this.panner).connect(dest);
    this.panner.connect(this.wet).connect(reverb);
  }

  update(listener: Vec3): void {
    if (this.done) return;
    const now = this.ctx.currentTime;
    const ev = this.song.events;
    if (now - this.start > this.song.seconds + 2) {
      this.dispose();
      return;
    }
    const far = Math.hypot(listener[0] - this.pos[0], listener[1] - this.pos[1], listener[2] - this.pos[2]) > HEAR_DISTANCE + 8;
    const until = now + LOOKAHEAD - this.start;
    while (this.idx < ev.length && ev[this.idx].t < until) {
      const e = ev[this.idx++];
      const at = this.start + e.t;
      // Lo que ya pasó (o no se oye) se salta: el disco sigue por donde va.
      if (far || at < now - 0.02) continue;
      for (const s of playNote(this.ctx, this.noise, this.out, e, at)) {
        this.live.add(s);
        s.addEventListener('ended', () => this.live.delete(s), { once: true });
      }
    }
  }

  /** Para el disco (con un fundido corto) y suelta los nodos. */
  dispose(): void {
    if (this.done) return;
    this.done = true;
    const now = this.ctx.currentTime;
    try {
      this.out.gain.setTargetAtTime(0, now, 0.08);
    } catch {
      /* ya desconectado */
    }
    for (const s of this.live) {
      try {
        s.stop(now + 0.4);
      } catch {
        /* ya parada */
      }
    }
    this.live.clear();
    setTimeout(() => {
      try {
        this.out.disconnect();
        this.panner.disconnect();
        this.wet.disconnect();
      } catch {
        /* ya desconectado */
      }
    }, 600);
  }
}

/** Todos los tocadiscos que suenan, por posición ("x,y,z"). */
export class Jukeboxes {
  private players = new Map<string, DiscPlayer>();

  constructor(private ctx: AudioContext, private noise: NoiseBuffers, private dest: AudioNode, private reverb: AudioNode) {}

  play(key: string, disc: number, pos: Vec3, elapsed: number): void {
    this.stop(key);
    this.players.set(key, new DiscPlayer(this.ctx, this.noise, this.dest, this.reverb, disc, pos, elapsed));
  }

  stop(key: string): void {
    this.players.get(key)?.dispose();
    this.players.delete(key);
  }

  /** ¿Cuántos suenan? (Para pruebas en el navegador.) */
  get count(): number {
    return this.players.size;
  }

  update(listener: Vec3): void {
    for (const [k, p] of this.players) {
      p.update(listener);
      if (p.done) this.players.delete(k);
    }
  }

  dispose(): void {
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
  }
}
