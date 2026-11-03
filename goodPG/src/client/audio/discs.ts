// Fase 6.5 (colecciones): las composiciones de los discos de música. Todas son originales (no imitan
// ninguna pieza real) y deterministas: la partitura de cada disco sale de una semilla con su nombre, así
// todos los jugadores oyen lo mismo. Aquí sólo se escribe la partitura (notas con tiempo, duración,
// instrumento, frecuencia y fuerza); jukebox.ts la toca con Web Audio.
//
// Cada disco tiene su carácter:
//   13        ambiental y sombrío: bordón grave, viento, campanas lejanas y goteos.
//   cat       alegre y saltarín: marimba, bajo que rebota y un ritmo suave.
//   blocks    funky: bajo sincopado, acordes de piano eléctrico a contratiempo y batería.
//   chirp     brillante, de videojuego antiguo: arpegios de onda cuadrada y trinos de pájaro.
//   far       soñador: colchones lentos, flauta y destellos de campana (modo lidio).
//   mall      jazz tranquilo: acordes de séptima, bajo caminante y un saxo.
//   mellohi   vals lento y melancólico, con un piano algo desafinado.
//   stal      jazz suave de saxo con órgano, en menor.
//   strad     marcha alegre: melodía en terceras, caja redoblante y glockenspiel.
//   ward      empieza con un piano solo y va sumando capas hasta el final.
//   11        roto e inquietante: estática, pasos, un latido y fragmentos que se deshacen.
//   wait      nostálgico y esperanzado: arpegios de piano y una melodía que sube.
//   otherside enérgico: bajo de corcheas, bombo a negras, arpegios rápidos y un solo.
//   5         (Fase 7.5) de las profundidades: bordón y ecos que rebotan, un latido que se acelera, pasos y
//             un piano frigio que al final se queda solo.
//   tears     (Fase 8.3) triste y suspendido, como el llanto de un ghast: colchón de cuerdas en menor, un pulso
//             grave y lento, gotas de campana (lágrimas), un piano que pregunta y una voz ondulante que responde.
import { DISCS } from '../../shared/discs';

export type Inst =
  | 'piano' | 'epiano' | 'pluck' | 'marimba' | 'pad' | 'strings' | 'organ' | 'bass' | 'drone' | 'bell' | 'lead' | 'chip'
  | 'sax' | 'flute' | 'kick' | 'snare' | 'hat' | 'openhat' | 'rim' | 'wind' | 'chirp' | 'glitch' | 'thud' | 'crackle'
  | 'clank' | 'drip' | 'woozy';

/** Una nota: t y d en segundos desde el principio del disco, f en Hz, v fuerza (0..1). */
export interface NoteEvent {
  t: number;
  d: number;
  i: Inst;
  f: number;
  v: number;
}

export interface Song {
  seconds: number;
  events: NoteEvent[];
}

// ------------------------------------------------------------------ utilidades

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Rng {
  private s: number;
  constructor(seed: string) {
    this.s = hash(seed) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const MODES: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

/** Un paso de un motivo: en qué semicorchea (o tiempo) empieza, cuánto dura y cuántos grados se mueve. */
interface Step {
  at: number;
  len: number;
  move: number;
}

/** Escritor de partituras: tempo, tonalidad, compás y la lista de notas. */
class Score {
  readonly events: NoteEvent[] = [];
  readonly beat: number;
  readonly bar: number;
  readonly scale: readonly number[];

  constructor(
    readonly rng: Rng,
    /** Nota MIDI de la tónica (octava central de la pieza). */
    readonly root: number,
    mode: string,
    bpm: number,
    /** Tiempos por compás. */
    readonly meter = 4,
    readonly seconds = 120,
  ) {
    this.scale = MODES[mode];
    this.beat = 60 / bpm;
    this.bar = this.beat * meter;
  }

  /** Nota MIDI del grado `d` (0 = tónica; puede ser negativo o pasar de la octava) + `oct` octavas. */
  deg(d: number, oct = 0): number {
    const n = this.scale.length;
    const o = Math.floor(d / n);
    return this.root + 12 * (oct + o) + this.scale[((d % n) + n) % n];
  }

  /** Nota en tiempos (beats) desde el principio. */
  note(beat: number, beats: number, i: Inst, midi: number, v: number): void {
    const t = beat * this.beat;
    if (t >= this.seconds - 0.05) return;
    this.events.push({ t, d: Math.min(beats * this.beat, this.seconds - t), i, f: mtof(midi), v });
  }

  /** Nota en segundos (para lo que no va a tempo). */
  at(t: number, d: number, i: Inst, f: number, v: number): void {
    if (t >= this.seconds - 0.05 || t < 0) return;
    this.events.push({ t, d: Math.min(d, this.seconds - t), i, f, v });
  }

  /** Compases que caben en la pieza. */
  get bars(): number {
    return Math.floor(this.seconds / this.bar);
  }

  /** Grados del acorde construido sobre el grado `d` (tríada o cuatriada). */
  chord(d: number, seventh = false): number[] {
    return seventh ? [d, d + 2, d + 4, d + 6] : [d, d + 2, d + 4];
  }

  /** Acordes sostenidos (un acorde por compás de `prog`). */
  pads(bar0: number, bars: number, prog: readonly number[], i: Inst, oct: number, v: number, seventh = false): void {
    for (let b = 0; b < bars; b++) {
      for (const d of this.chord(prog[(bar0 + b) % prog.length], seventh)) this.note((bar0 + b) * this.meter, this.meter, i, this.deg(d, oct), v);
    }
  }

  /** Arpegio: `pattern` son índices de nota del acorde (−1 silencio) repartidos en `steps` por compás. */
  arp(bar0: number, bars: number, prog: readonly number[], i: Inst, oct: number, v: number, pattern: readonly number[], steps: number, gate = 0.9, seventh = false): void {
    const len = this.meter / steps;
    for (let b = 0; b < bars; b++) {
      const ch = this.chord(prog[(bar0 + b) % prog.length], seventh);
      for (let s = 0; s < steps; s++) {
        const k = pattern[s % pattern.length];
        if (k < 0) continue;
        const d = ch[k % ch.length] + Math.floor(k / ch.length) * this.scale.length;
        const accent = s % (steps / this.meter) === 0 ? 1 : 0.8;
        this.note((bar0 + b) * this.meter + s * len, len * gate, i, this.deg(d, oct), v * accent);
      }
    }
  }

  /** Bajo: 'root' redondas, 'pulse' negras, 'rootfifth', 'eighths', 'walking' o 'syncop'. */
  bass(bar0: number, bars: number, prog: readonly number[], style: string, i: Inst, oct: number, v: number): void {
    for (let b = 0; b < bars; b++) {
      const d = prog[(bar0 + b) % prog.length];
      const next = prog[(bar0 + b + 1) % prog.length];
      const t0 = (bar0 + b) * this.meter;
      const r = this.deg(d, oct), fifth = this.deg(d + 4, oct);
      switch (style) {
        case 'root':
          this.note(t0, this.meter, i, r, v);
          break;
        case 'pulse':
          for (let k = 0; k < this.meter; k++) this.note(t0 + k, 0.8, i, r, v * (k === 0 ? 1 : 0.8));
          break;
        case 'rootfifth':
          for (let k = 0; k < this.meter; k++) this.note(t0 + k, 0.7, i, k % 2 ? fifth - 12 : r, v * (k === 0 ? 1 : 0.8));
          break;
        case 'eighths':
          for (let k = 0; k < this.meter * 2; k++) this.note(t0 + k / 2, 0.42, i, k === 7 && this.rng.chance(0.5) ? r + 12 : r, v * (k % 2 ? 0.75 : 1));
          break;
        case 'walking': {
          // Negras que caminan hacia la raíz del compás siguiente.
          const target = this.deg(next, oct);
          const notes = [r, this.deg(d + 2, oct), this.deg(d + 4, oct), target + (target > r ? -1 : 1)];
          notes.forEach((m, k) => this.note(t0 + k, 0.9, i, m, v * (k === 0 ? 1 : 0.85)));
          break;
        }
        case 'syncop': {
          const hits: [number, number, number][] = [[0, 0.7, 0], [0.75, 0.25, 0], [1.5, 0.5, 7], [2.5, 0.4, 0], [3, 0.25, 12], [3.5, 0.4, 10]];
          for (const [at, len, add] of hits) this.note(t0 + at, len, i, r + add, v * (at === 0 ? 1 : 0.8));
          break;
        }
      }
    }
  }

  /** Batería: cada patrón es una cadena por semicorcheas ('x' golpe, 'o' flojo, '.' nada). */
  drums(bar0: number, bars: number, pat: Partial<Record<'kick' | 'snare' | 'hat' | 'openhat' | 'rim', string>>, v = 1): void {
    for (let b = 0; b < bars; b++) {
      for (const [inst, str] of Object.entries(pat) as [Inst, string][]) {
        const len = this.meter / str.length;
        for (let s = 0; s < str.length; s++) {
          const ch = str[s];
          if (ch === '.') continue;
          this.note((bar0 + b) * this.meter + s * len, len, inst, 60, v * (ch === 'x' ? 1 : 0.5));
        }
      }
    }
  }

  /** Motivo al azar: `notes` notas en `steps` pasos por compás (se repite y varía en melody()). */
  motif(steps: number, notes: number, maxLeap = 2): Step[] {
    const at = new Set<number>([0]);
    while (at.size < notes) at.add(this.rng.int(1, steps - 1));
    const sorted = [...at].sort((a, b) => a - b);
    return sorted.map((s, k) => ({
      at: s,
      len: (k + 1 < sorted.length ? sorted[k + 1] : steps) - s,
      move: k === 0 ? 0 : this.rng.int(-maxLeap, maxLeap) || 1,
    }));
  }

  /**
   * Melodía hecha con un motivo que se repite compás a compás, ajustado a los acordes (las notas largas
   * caen en notas del acorde) y con el final de cada frase de cuatro compases en una nota larga.
   */
  melody(bar0: number, bars: number, prog: readonly number[], m: Step[], steps: number, i: Inst, oct: number, v: number, start = 4, gate = 0.95): void {
    const len = this.meter / steps;
    let cur = start;
    for (let b = 0; b < bars; b++) {
      const ch = this.chord(prog[(bar0 + b) % prog.length]);
      const phraseEnd = b % 4 === 3;
      // Variación: cada dos compases el motivo sube o baja un poco.
      const shift = b % 2 === 1 ? this.rng.int(-1, 1) : 0;
      m.forEach((st, k) => {
        if (phraseEnd && k > 1) return;
        cur += st.move + (k === 0 ? shift : 0);
        const long = st.len * len >= 1 || phraseEnd;
        if (long) cur = nearestChordTone(cur, ch, this.scale.length);
        cur = Math.max(start - 5, Math.min(start + 7, cur));
        const dur = phraseEnd && k === Math.min(1, m.length - 1) ? steps - st.at : st.len;
        this.note((bar0 + b) * this.meter + st.at * len, dur * len * gate, i, this.deg(cur, oct), v * (k === 0 ? 1 : 0.85));
      });
      if (phraseEnd) cur = start;
    }
  }

  song(): Song {
    this.events.sort((a, b) => a.t - b.t);
    return { seconds: this.seconds, events: this.events };
  }
}

/** Grado del acorde más cercano a `d`. */
function nearestChordTone(d: number, chord: readonly number[], n: number): number {
  let best = d, bd = Infinity;
  for (const c of chord) {
    for (let o = -2; o <= 2; o++) {
      const x = c + o * n;
      if (Math.abs(x - d) < bd) {
        bd = Math.abs(x - d);
        best = x;
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ los discos

type Composer = (seconds: number, rng: Rng) => Song;

/** 13: ambiental y sombrío, sin pulso. */
const thirteen: Composer = (seconds, rng) => {
  const s = new Score(rng, 45, 'phrygian', 60, 4, seconds);
  // Bordón grave que cambia de nota muy de tarde en tarde.
  let t = 0;
  for (const d of [0, 0, 1, 0, -2, 0, 1, 0]) {
    const dur = seconds / 8 + 2;
    s.at(t, dur, 'drone', mtof(s.deg(d, -2)), 0.55);
    t += seconds / 8;
  }
  // Viento: ráfagas largas que suben y bajan.
  for (let w = rng.range(2, 6); w < seconds; w += rng.range(9, 18)) s.at(w, rng.range(6, 12), 'wind', rng.range(300, 900), rng.range(0.3, 0.6));
  // Campanas lejanas y desafinadas.
  for (let b = rng.range(6, 10); b < seconds - 4; b += rng.range(5, 11)) {
    const m = s.deg(rng.pick([0, 1, 3, 4, 6]), rng.pick([0, 1]));
    s.at(b, 5, 'bell', mtof(m) * rng.range(0.985, 1.015), rng.range(0.15, 0.3));
    if (rng.chance(0.4)) s.at(b + rng.range(0.6, 1.6), 4, 'bell', mtof(m + rng.pick([1, 3, -2])), 0.12);
  }
  // Goteos y algún golpe metálico en la lejanía.
  for (let d = rng.range(3, 5); d < seconds; d += rng.range(1.5, 5)) s.at(d, 0.3, 'drip', rng.range(1400, 2600), rng.range(0.1, 0.25));
  for (let c = rng.range(20, 30); c < seconds - 5; c += rng.range(22, 40)) s.at(c, 1.2, 'clank', rng.range(160, 320), 0.35);
  return s.song();
};

/** cat: alegre y saltarín. */
const cat: Composer = (seconds, rng) => {
  const s = new Score(rng, 65, 'major', 104, 4, seconds);
  const prog = [0, 4, 5, 3];
  const progB = [3, 4, 2, 5];
  const a = s.motif(8, 5, 2), b = s.motif(8, 4, 3);
  const total = s.bars;
  let bar = 0;
  const section = (n: number, p: readonly number[], m: Step[], drums: boolean, lead = true) => {
    n = Math.min(n, total - bar);
    if (n <= 0) return;
    s.bass(bar, n, p, 'rootfifth', 'bass', -2, 0.5);
    s.arp(bar, n, p, 'pluck', 0, 0.16, [-1, 0, 1, 2, -1, 1, 2, 1], 8, 0.5);
    if (lead) s.melody(bar, n, p, m, 8, 'marimba', 1, 0.38, 2);
    if (drums) s.drums(bar, n, { kick: 'x.......x.......', hat: '..o...o...o...o.', rim: '....x.......x...' }, 0.55);
    bar += n;
  };
  section(4, prog, a, false, false);
  section(8, prog, a, true);
  section(8, progB, b, true);
  section(8, prog, a, true);
  section(4, progB, b, false);
  section(8, prog, a, true);
  while (bar < total) section(4, prog, a, bar < total - 4, true);
  return s.song();
};

/** blocks: funky, con batería. */
const blocks: Composer = (seconds, rng) => {
  const s = new Score(rng, 62, 'dorian', 116, 4, seconds);
  const prog = [0, 3, 0, 4];
  const bridge = [5, 3, 1, 4];
  const lead = s.motif(16, 7, 2), call = s.motif(16, 4, 3);
  const beat = { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' };
  const total = s.bars;
  let bar = 0;
  const part = (n: number, p: readonly number[], m: Step[] | null, drums: boolean) => {
    n = Math.min(n, total - bar);
    if (n <= 0) return;
    s.bass(bar, n, p, 'syncop', 'bass', -2, 0.55);
    // Acordes de piano eléctrico a contratiempo.
    s.arp(bar, n, p, 'epiano', 0, 0.14, [-1, -1, 0, -1, -1, -1, 1, -1, -1, -1, 2, -1, -1, 1, -1, -1], 16, 0.8, true);
    s.arp(bar, n, p, 'epiano', 0, 0.1, [-1, -1, 2, -1, -1, -1, 3, -1, -1, -1, 1, -1, -1, 3, -1, -1], 16, 0.8, true);
    if (m) s.melody(bar, n, p, m, 16, 'lead', 1, 0.2, 4, 0.7);
    if (drums) s.drums(bar, n, beat, 0.7);
    bar += n;
  };
  part(4, prog, null, true);
  part(8, prog, lead, true);
  part(8, prog, call, true);
  part(8, bridge, null, false);
  part(8, prog, lead, true);
  part(8, bridge, call, true);
  while (bar < total) part(4, prog, lead, true);
  return s.song();
};

/** chirp: brillante, de videojuego antiguo, con pájaros. */
const chirp: Composer = (seconds, rng) => {
  const s = new Score(rng, 67, 'mixolydian', 128, 4, seconds);
  const prog = [0, 6, 3, 0];
  const progB = [3, 4, 0, 6];
  const m = s.motif(8, 6, 2);
  const total = s.bars;
  for (let bar = 0; bar < total; bar += 8) {
    const p = (bar / 8) % 2 ? progB : prog;
    const n = Math.min(8, total - bar);
    s.arp(bar, n, p, 'chip', 0, 0.09, [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3], 16, 0.5);
    s.bass(bar, n, p, 'pulse', 'bass', -2, 0.45);
    if (bar >= 8) s.melody(bar, n, p, m, 8, 'chip', 1, 0.11, 2, 0.8);
    if (bar >= 8) s.drums(bar, n, { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' }, 0.45);
  }
  // Trinos de pájaro al azar.
  for (let t = rng.range(1, 3); t < seconds - 1; t += rng.range(2, 6)) {
    const f = rng.range(2200, 3600);
    const n = rng.int(2, 5);
    for (let k = 0; k < n; k++) s.at(t + k * 0.09, 0.08, 'chirp', f * (1 + k * 0.04), 0.12);
  }
  return s.song();
};

/** far: soñador, en modo lidio y sin batería. */
const far: Composer = (seconds, rng) => {
  const s = new Score(rng, 64, 'lydian', 72, 4, seconds);
  const prog = [0, 1, 0, 5, 3, 1];
  const m = s.motif(4, 3, 2);
  const total = s.bars;
  s.pads(0, total, prog, 'pad', -1, 0.12);
  for (let bar = 2; bar < total - 1; bar += 6) s.melody(bar, Math.min(4, total - bar - 1), prog, m, 4, 'flute', 0, 0.3, 4);
  s.arp(4, Math.max(0, total - 6), prog, 'bell', 1, 0.07, [2, -1, 1, -1, 0, -1, 1, -1], 8, 1.5);
  s.bass(0, total, prog, 'root', 'drone', -2, 0.25);
  for (let t = rng.range(4, 8); t < seconds - 3; t += rng.range(6, 12)) s.at(t, 3, 'bell', mtof(s.deg(rng.pick([4, 6, 8]), 2)), 0.08);
  return s.song();
};

/** mall: jazz tranquilo. */
const mall: Composer = (seconds, rng) => {
  const s = new Score(rng, 58, 'major', 92, 4, seconds);
  // ii–V–I–vi con séptimas.
  const prog = [1, 4, 0, 5];
  const bridge = [3, 2, 1, 4];
  const m = s.motif(8, 5, 2), m2 = s.motif(8, 4, 3);
  const total = s.bars;
  let bar = 0;
  while (bar < total) {
    const b = Math.floor(bar / 8) % 3 === 2;
    const p = b ? bridge : prog;
    const n = Math.min(8, total - bar);
    s.bass(bar, n, p, 'walking', 'bass', -2, 0.5);
    s.arp(bar, n, p, 'epiano', 0, 0.13, [-1, -1, 0, -1, -1, -1, -1, -1], 8, 1.4, true);
    s.arp(bar, n, p, 'epiano', 0, 0.1, [-1, -1, 1, -1, -1, 3, -1, -1], 8, 0.8, true);
    s.drums(bar, n, { hat: 'x..ox..ox..ox..o', rim: '....o.......o...' }, 0.4);
    if (bar >= 4) s.melody(bar, n, p, b ? m2 : m, 8, 'sax', 0, 0.28, 4, 0.9);
    bar += n;
  }
  return s.song();
};

/** mellohi: vals lento y melancólico. */
const mellohi: Composer = (seconds, rng) => {
  const s = new Score(rng, 57, 'harmonic', 66, 3, seconds);
  const prog = [0, 3, 4, 0, 5, 3, 4, 4];
  const m = s.motif(3, 2, 2);
  const total = s.bars;
  for (let b = 0; b < total; b++) {
    const d = prog[b % prog.length];
    s.note(b * 3, 2.8, 'woozy', s.deg(d, -2), 0.45);
    for (const beat of [1, 2]) for (const k of [2, 4]) s.note(b * 3 + beat, 0.9, 'woozy', s.deg(d + k, -1), 0.2);
  }
  s.melody(2, total - 3, prog, m, 3, 'woozy', 0, 0.42, 4, 1);
  return s.song();
};

/** stal: jazz suave de saxo, en menor. */
const stal: Composer = (seconds, rng) => {
  const s = new Score(rng, 55, 'dorian', 100, 4, seconds);
  const prog = [0, 0, 3, 3, 4, 3, 0, 4];
  const m = s.motif(8, 6, 2);
  const total = s.bars;
  s.pads(0, total, prog, 'organ', -1, 0.07, true);
  s.bass(0, total, prog, 'walking', 'bass', -2, 0.45);
  s.drums(0, total, { kick: 'x.........x.....', rim: '....x.......x...', hat: 'x.xox.xox.xox.xo' }, 0.45);
  for (let bar = 2; bar < total; bar += 10) s.melody(bar, Math.min(8, total - bar), prog, m, 8, 'sax', 1, 0.3, 2);
  return s.song();
};

/** strad: marcha alegre. */
const strad: Composer = (seconds, rng) => {
  const s = new Score(rng, 67, 'major', 120, 4, seconds);
  const prog = [0, 3, 4, 0, 0, 3, 4, 4];
  const m = s.motif(8, 6, 2);
  const total = s.bars;
  s.bass(0, total, prog, 'rootfifth', 'bass', -2, 0.5);
  s.drums(0, total, { kick: 'x...x...x...x...', snare: '....x..o....x.oo' }, 0.55);
  for (let bar = 2; bar < total; bar += 8) {
    const n = Math.min(8, total - bar);
    s.melody(bar, n, prog, m, 8, 'chip', 0, 0.12, 4);
    s.melody(bar, n, prog, m, 8, 'chip', 0, 0.08, 2); // la misma melodía en terceras
    s.melody(bar, n, prog, m, 8, 'bell', 1, 0.08, 4);
  }
  s.arp(0, total, prog, 'pluck', 0, 0.08, [0, 1, 2, 1], 4, 0.4);
  return s.song();
};

/** ward: empieza con un piano solo y va sumando capas. */
const ward: Composer = (seconds, rng) => {
  const s = new Score(rng, 60, 'mixolydian', 96, 4, seconds);
  const prog = [0, 6, 3, 0, 4, 6, 3, 4];
  const m = s.motif(8, 5, 2), m2 = s.motif(8, 6, 3);
  const total = s.bars;
  const q = Math.floor(total / 4);
  s.arp(0, total, prog, 'piano', 0, 0.26, [0, 1, 2, 1, 0, 1, 2, 1], 8, 1.2);
  s.melody(0, q, prog, m, 8, 'piano', 1, 0.36, 2);
  s.arp(q, total - q - 2, prog, 'pluck', 1, 0.1, [2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1, 2, 3, 4, 3], 16, 0.5);
  s.pads(q * 2, total - q * 2, prog, 'strings', -1, 0.09);
  s.bass(q, total - q, prog, 'rootfifth', 'bass', -2, 0.45);
  s.drums(q * 2, q - 2, { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 0.5);
  s.drums(q * 3 - 2, q, { kick: 'x.......x.x.....', snare: '....x.......x..o', hat: 'xoxoxoxoxoxoxoxo' }, 0.6);
  s.melody(q * 2, q * 2 - 2, prog, m2, 8, 'lead', 1, 0.16, 4);
  s.melody(total - 2, 2, [0], m, 8, 'piano', 1, 0.25, 0);
  return s.song();
};

/** 11: roto e inquietante. */
const eleven: Composer = (seconds, rng) => {
  const s = new Score(rng, 50, 'minor', 60, 4, seconds);
  // Estática: chasquidos sueltos todo el rato.
  for (let t = 0; t < seconds; t += rng.range(0.05, 0.4)) s.at(t, 0.02, 'crackle', rng.range(2000, 6000), rng.range(0.05, 0.2));
  // Pasos que se acercan y se alejan.
  for (let t = rng.range(6, 10); t < seconds - 20; t += rng.range(15, 25)) {
    const n = rng.int(6, 12);
    for (let k = 0; k < n; k++) s.at(t + k * 0.55, 0.12, 'thud', 90, 0.15 + 0.3 * Math.sin((k / n) * Math.PI));
  }
  // Latido.
  for (let t = 20; t < 50; t += 0.9) {
    s.at(t, 0.1, 'thud', 60, 0.3);
    s.at(t + 0.22, 0.1, 'thud', 55, 0.2);
  }
  // Fragmentos de melodía que se deshacen.
  for (let t = rng.range(3, 6); t < seconds - 10; t += rng.range(6, 12)) {
    const base = s.deg(rng.int(0, 6), 0);
    for (let k = 0; k < rng.int(2, 4); k++) s.at(t + k * 0.35, 0.5, 'glitch', mtof(base - k * rng.int(1, 3)), 0.18);
  }
  s.at(seconds - 6, 1.5, 'wind', 400, 0.6);
  s.at(seconds - 2.5, 0.6, 'thud', 45, 0.7);
  return s.song();
};

/** wait: nostálgico y esperanzado. */
const wait: Composer = (seconds, rng) => {
  const s = new Score(rng, 62, 'major', 84, 4, seconds);
  const prog = [0, 2, 3, 4];
  const progB = [5, 3, 0, 4];
  const m = s.motif(8, 5, 2), m2 = s.motif(8, 4, 2);
  const total = s.bars;
  for (let bar = 0; bar < total; bar += 8) {
    const n = Math.min(8, total - bar);
    const b = (bar / 8) % 2 === 1;
    const p = b ? progB : prog;
    s.arp(bar, n, p, 'piano', -1, 0.22, [0, 2, 1, 2, 0, 2, 1, 2], 8, 1.3);
    s.bass(bar, n, p, 'root', 'piano', -2, 0.28);
    if (bar >= 4) s.melody(bar, n, p, b ? m2 : m, 8, 'piano', 1, 0.4, b ? 5 : 3);
    if (bar >= 16) s.pads(bar, n, p, 'strings', -1, 0.06);
    if (bar >= 24 && bar < total - 8) s.drums(bar, n, { kick: 'x.......x.......', hat: '....o.......o...' }, 0.35);
  }
  return s.song();
};

/** otherside: enérgico, con bajo de corcheas y un solo. */
const otherside: Composer = (seconds, rng) => {
  const s = new Score(rng, 57, 'minor', 138, 4, seconds);
  const prog = [0, 5, 2, 6];
  const progB = [3, 4, 0, 0];
  const m = s.motif(16, 8, 2), m2 = s.motif(16, 6, 3);
  const four = { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', openhat: '..............x.' };
  const total = s.bars;
  let bar = 0;
  const part = (n: number, p: readonly number[], lead: Step[] | null, drums: boolean, arp = true) => {
    n = Math.min(n, total - bar);
    if (n <= 0) return;
    s.bass(bar, n, p, 'eighths', 'bass', -2, 0.5);
    if (arp) s.arp(bar, n, p, 'pluck', 0, 0.1, [0, 1, 2, 4, 2, 1, 0, 2, 0, 1, 2, 4, 3, 2, 1, 2], 16, 0.45);
    if (drums) s.drums(bar, n, four, 0.7);
    if (lead) s.melody(bar, n, p, lead, 16, 'lead', 1, 0.17, 4, 0.8);
    bar += n;
  };
  part(4, prog, null, false);
  part(8, prog, null, true);
  part(8, prog, m, true);
  part(4, progB, null, false, true);
  part(8, progB, m2, true);
  part(8, prog, m, true);
  s.pads(bar, Math.min(8, total - bar), prog, 'pad', -1, 0.12);
  part(8, prog, m2, false);
  while (bar < total) part(8, prog, m, true);
  return s.song();
};

/** 5 (Fase 7.5): oscuro y tenso, con ecos, un latido que se acelera y un piano frigio. */
const five: Composer = (seconds, rng) => {
  const s = new Score(rng, 45, 'phrygian', 72, 4, seconds);
  const total = s.bars;
  const prog = [0, 1, 0, 6];
  // Bordón grave y viento todo el rato.
  for (let bar = 0; bar < total; bar += 2) s.note(bar * 4, 8, 'drone', s.deg(0, -1), 0.22);
  for (let t = rng.range(2, 5); t < seconds - 4; t += rng.range(9, 16)) s.at(t, rng.range(3, 6), 'wind', rng.range(250, 500), 0.18);
  // Ecos: una campana que rebota y se apaga (como un fragmento de eco).
  for (let t = rng.range(3, 6); t < seconds - 8; t += rng.range(7, 12)) {
    const f = mtof(s.deg(rng.pick([0, 2, 4, 7]), 1));
    for (let k = 0; k < 5; k++) s.at(t + k * 0.42, 1.2, 'bell', f, 0.22 * Math.pow(0.6, k));
  }
  // Latido: lento al principio, cada vez más deprisa en el centro y lento otra vez al final.
  const third = seconds / 3;
  for (let t = third * 0.6; t < seconds - 12;) {
    const x = Math.min(1, Math.max(0, 1 - Math.abs(t - third * 1.6) / (third * 0.9)));
    s.at(t, 0.12, 'thud', 58, 0.2 + 0.25 * x);
    s.at(t + 0.2, 0.1, 'thud', 52, 0.15 + 0.2 * x);
    t += 1.8 - 1.2 * x;
  }
  // Pasos lejanos que se paran de golpe.
  for (let t = third * 0.4; t < seconds - 30; t += rng.range(28, 40)) {
    const n = rng.int(5, 9);
    for (let k = 0; k < n; k++) s.at(t + k * 0.6, 0.1, 'thud', 95, 0.12);
  }
  // Piano frigio: entra con el latido, crece con cuerdas y al final se queda solo.
  const m = s.motif(8, 4, 2);
  const start = Math.floor(total * 0.25), end = Math.floor(total * 0.85);
  s.melody(start, end - start, prog, m, 8, 'piano', 0, 0.3, 2, 1.1);
  s.pads(Math.floor(total * 0.45), Math.floor(total * 0.3), prog, 'strings', -1, 0.08);
  for (let bar = Math.floor(total * 0.5); bar < Math.floor(total * 0.7); bar++) s.note(bar * 4 + 2, 1.5, 'woozy', s.deg(1, 0), 0.08);
  s.melody(end, total - end - 1, [0], m, 8, 'piano', 0, 0.2, 0, 1.4);
  s.at(seconds - 3, 2.5, 'drone', mtof(s.deg(0, -2)), 0.3);
  return s.song();
};

/** tears: triste y suspendido, del Nether. */
const tears: Composer = (seconds, rng) => {
  const s = new Score(rng, 50, 'minor', 68, 4, seconds);
  const total = s.bars;
  const prog = [0, 5, 3, 4, 0, 5, 6, 4];
  // Colchón de cuerdas y un pulso grave (dos negras por compás) desde el principio.
  s.pads(0, total, prog, 'strings', -1, 0.07);
  for (let b = 0; b < total; b++) {
    const d = prog[b % prog.length];
    s.note(b * 4, 1.6, 'bass', s.deg(d, -2), 0.32);
    s.note(b * 4 + 2, 1.4, 'bass', s.deg(d, -2), 0.22);
  }
  // Lágrimas: gotas de campana que caen de vez en cuando y a veces rebotan.
  for (let t = rng.range(4, 8); t < seconds - 6; t += rng.range(5, 10)) {
    const f = mtof(s.deg(rng.pick([0, 2, 4, 6]), 2));
    s.at(t, 0.8, 'drip', f, 0.14);
    if (rng.chance(0.4)) s.at(t + 0.35, 0.8, 'bell', f / 2, 0.08);
  }
  // El piano pregunta (compases pares) y la voz ondulante responde (impares), a partir del cuarto compás.
  const ask = s.motif(8, 5, 2);
  const answer = s.motif(8, 4, 1);
  for (let bar = 4; bar < total - 4; bar += 8) {
    s.melody(bar, Math.min(4, total - 4 - bar), prog, ask, 8, 'piano', 0, 0.3, 4, 1.2);
    s.melody(bar + 4, Math.min(4, total - 4 - bar - 4), prog, answer, 8, 'woozy', 0, 0.16, 6, 1.4);
  }
  // Final: sólo el colchón que se apaga en la tónica.
  s.at(seconds - 5, 4.5, 'pad', mtof(s.deg(0, -1)), 0.2);
  return s.song();
};

/** pigstep: funk del Nether, con el bajo a saltos, batería con swing, metales y un piano eléctrico a contratiempo. */
const pigstep: Composer = (seconds, rng) => {
  const s = new Score(rng, 45, 'dorian', 86, 4, seconds);
  const prog = [0, 0, 3, 4];
  const turn = [5, 4, 3, 4];
  const riff = s.motif(16, 7, 3), horn = s.motif(8, 4, 2);
  const beat = { kick: 'x..x..x...x.x...', snare: '....x.......x..o', hat: 'x.xox.xox.xox.xo', openhat: '..............x.' };
  const total = s.bars;
  let bar = 0;
  const part = (n: number, p: readonly number[], lead: boolean, hornOn: boolean, drums: boolean) => {
    n = Math.min(n, total - bar);
    if (n <= 0) return;
    s.bass(bar, n, p, 'syncop', 'bass', -2, 0.6);
    s.arp(bar, n, p, 'epiano', 0, 0.12, [-1, -1, 0, -1, -1, -1, 2, -1, -1, 1, -1, -1, 0, -1, -1, -1], 16, 0.6, true);
    if (lead) s.melody(bar, n, p, riff, 16, 'lead', 0, 0.18, 4, 0.6);
    if (hornOn) s.melody(bar, n, p, horn, 8, 'sax', 0, 0.16, 2, 0.9);
    if (drums) s.drums(bar, n, beat, 0.75);
    bar += n;
  };
  part(2, prog, false, false, true);
  part(8, prog, true, false, true);
  part(8, prog, true, true, true);
  part(4, turn, false, true, false);
  part(8, prog, true, true, true);
  part(8, turn, false, true, true);
  while (bar < total) part(4, prog, true, bar % 8 === 0, true);
  s.at(seconds - 2.5, 2, 'drone', mtof(s.deg(0, -2)), 0.25);
  return s.song();
};

const COMPOSERS: Readonly<Record<string, Composer>> = {
  '13': thirteen, cat, blocks, chirp, far, mall, mellohi, stal, strad, ward, '11': eleven, wait, otherside,
  '5': five, // Fase 7.5 (abismo)
  tears, // Fase 8.3 (criaturas del Nether)
  pigstep, // Fase 8.4 (estructuras del Nether)
};

const cache = new Map<number, Song>();

/** Partitura del disco `index` (de DISCS), siempre la misma (`fresh`: sin la caché, para las pruebas). */
export function composeDisc(index: number, fresh = false): Song {
  let song = fresh ? undefined : cache.get(index);
  if (song) return song;
  const def = DISCS[index];
  song = COMPOSERS[def.key](def.seconds, new Rng('disco/' + def.key));
  if (!fresh) cache.set(index, song);
  return song;
}
