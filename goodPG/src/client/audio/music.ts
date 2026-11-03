// Música generativa: piezas de piano calmadas y dispersas, de inspiración C418 (no una copia de
// ninguna canción real). Cada frase se compone entera de una vez (con tiempos absolutos del
// AudioContext) y se deja programada; Web Audio se encarga de la reproducción precisa aunque el
// bucle de fotogramas no sea perfectamente regular.
import { choice, randInt, randRange } from './types';

const MAJOR_PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC: readonly number[] = [0, 3, 5, 7, 10];
// Raíces graves tipo piano: C3, D3, E3, F3, G3.
const ROOTS: readonly number[] = [130.81, 146.83, 164.81, 174.61, 196.0];

function noteFreq(root: number, semitones: number): number {
  return root * Math.pow(2, semitones / 12);
}

function clampIndex(i: number, len: number): number {
  return ((i % len) + len) % len;
}

/**
 * Fase 8.2: escala, raíz (Hz) y tempo de la música de cada bioma del Nether (en Java cada uno tiene sus
 * pistas: aquí son frases generadas con colchones lentos y notas graves sueltas, en modos oscuros).
 */
const NETHER_STYLES: Record<number, { scale: readonly number[]; root: number; beat: [number, number] }> = {
  52: { scale: [0, 1, 3, 5, 7, 8, 10], root: 65.41, beat: [1.4, 2] }, // desiertos: frigio
  53: { scale: [0, 2, 3, 5, 7, 8, 10], root: 55, beat: [1.8, 2.6] }, // valle de almas: eolio, muy lento
  54: { scale: [0, 2, 3, 5, 7, 8, 11], root: 61.74, beat: [1.2, 1.8] }, // bosque carmesí: menor armónica
  55: { scale: [0, 2, 4, 6, 9], root: 73.42, beat: [1.5, 2.2] }, // bosque distorsionado: lidio, frío
  56: { scale: [0, 1, 3, 5, 6, 8, 10], root: 51.91, beat: [1.3, 1.9] }, // deltas de basalto: locrio
  // Fase 8.6: el End (en Java, «The End»): muy lento y abierto, suspendido en quintas sobre un eolio lejano.
  57: { scale: [0, 2, 3, 7, 8], root: 58.27, beat: [2.2, 3.2] },
  58: { scale: [0, 2, 3, 7, 8], root: 58.27, beat: [2.2, 3.2] },
  59: { scale: [0, 2, 3, 7, 8], root: 58.27, beat: [2.2, 3.2] },
  60: { scale: [0, 2, 3, 7, 8], root: 58.27, beat: [2.2, 3.2] },
  61: { scale: [0, 2, 3, 7, 8], root: 58.27, beat: [2.2, 3.2] },
};

/** Fase 8.6: el estilo de la música del combate con el dragón (en Java, «Boss»). */
export const BOSS_STYLE = 99;

export class MusicEngine {
  private countdown: number;
  /** Fase 8.2: bioma del Nether cuya música suena (−1: la del mundo normal). */
  private style = -1;
  private readonly pending: AudioScheduledSourceNode[] = [];
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly reverbSend: AudioNode,
  ) {
    // Pequeño silencio inicial: deja que la ambientación se asiente antes de la primera frase.
    this.countdown = randRange(8, 30);
  }

  /** Fase 8.2: estilo de la música (bioma del Nether, −1 para el mundo normal). Al cambiar de mundo, vuelve pronto. */
  setStyle(style: number): void {
    if (style === this.style) return;
    if ((style >= 0) !== (this.style >= 0)) this.countdown = Math.min(this.countdown, randRange(15, 40));
    // Fase 8.6: la del jefe empieza enseguida; al acabar el combate, lo que suene se deja terminar.
    if (style === BOSS_STYLE) this.countdown = Math.min(this.countdown, 1.5);
    this.style = style;
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.countdown -= dt;
    if (this.countdown <= 0) {
      const startAt = this.ctx.currentTime + 1.5;
      if (this.style === BOSS_STYLE) {
        // Fase 8.6: sin silencios mientras dura el combate.
        this.countdown = this.scheduleBossPhrase(startAt) - 0.2;
        return;
      }
      const phraseDuration = this.style >= 0 ? this.scheduleNetherPhrase(startAt, this.style) : this.schedulePhrase(startAt);
      this.countdown = Math.max(phraseDuration + 20, randRange(120, 240));
    }
  }

  /** Genera y programa una frase completa; devuelve su duración aproximada en segundos. */
  private schedulePhrase(startAt: number): number {
    const scale = Math.random() < 0.55 ? MAJOR_PENTATONIC : MINOR_PENTATONIC;
    const root = choice(ROOTS);
    const beat = randRange(0.85, 1.4);
    const targetSeconds = randRange(30, 90);
    const beats = Math.max(8, Math.floor(targetSeconds / beat));

    let melodyIndex = randInt(0, scale.length - 1);
    let melodyOctave = 1;
    let lastChordBeat = -999;
    let nextChordGap = randInt(4, 8);

    for (let b = 0; b < beats; b++) {
      const beatTime = startAt + b * beat;

      // Melodía: paseo aleatorio de paso corto dentro de la escala, con huecos (silencio disperso).
      if (Math.random() < 0.58) {
        melodyIndex = clampIndex(melodyIndex + randInt(-1, 1), scale.length);
        if (Math.random() < 0.12) melodyOctave = melodyOctave === 1 ? 2 : 1;
        const semis = scale[melodyIndex] + 12 * melodyOctave;
        const dur = beat * randRange(1, 2.4);
        const jitter = randRange(-0.03, 0.03);
        this.playPianoNote(noteFreq(root, semis), beatTime + jitter, dur, randRange(0.12, 0.26));
      }

      // Acorde grave ocasional (raíz + dos grados) como sostén armónico suave.
      if (b - lastChordBeat >= nextChordGap) {
        lastChordBeat = b;
        nextChordGap = randInt(4, 8);
        const dur = beat * randRange(3, 6);
        const chordTones = [0, scale[2], scale[4]];
        for (const ct of chordTones) {
          this.playPianoNote(noteFreq(root, ct), beatTime + randRange(-0.02, 0.02), dur, randRange(0.07, 0.15));
        }
      }
    }

    return beats * beat;
  }

  /** Fase 8.2: frase del Nether: colchones que entran y salen despacio sobre un bajo, y notas sueltas graves. */
  private scheduleNetherPhrase(startAt: number, biome: number): number {
    const st = NETHER_STYLES[biome] ?? NETHER_STYLES[52];
    const beat = randRange(st.beat[0], st.beat[1]);
    const beats = Math.max(8, Math.floor(randRange(40, 90) / beat));
    let idx = 0;
    for (let b = 0; b < beats; b += randInt(4, 8)) {
      // Colchón: raíz y dos grados de la escala, con ataque y caída largos.
      const deg = choice([0, 0, 2, 3, 4]);
      const tones = [0, st.scale[(deg + 2) % st.scale.length], st.scale[(deg + 4) % st.scale.length] + 12];
      for (const t of tones) this.playPad(noteFreq(st.root * 2, st.scale[deg] + t), startAt + b * beat, beat * randRange(5, 8), 0.035);
    }
    for (let b = 0; b < beats; b++) {
      if (Math.random() > 0.3) continue;
      idx = clampIndex(idx + randInt(-2, 2), st.scale.length);
      const semis = st.scale[idx] + 12 * (Math.random() < 0.3 ? 2 : 1);
      this.playPianoNote(noteFreq(st.root * 2, semis), startAt + b * beat, beat * randRange(2, 4), randRange(0.05, 0.12));
    }
    return beats * beat;
  }

  /**
   * Fase 8.6: frase del combate con el dragón: un ostinato grave en corcheas (frigio) que empuja, colchones que suben
   * de tono cada cuatro compases y un grito agudo suelto de vez en cuando. Unos 20 s por frase, encadenadas.
   */
  private scheduleBossPhrase(startAt: number): number {
    const scale = [0, 1, 3, 5, 7, 8, 10];
    const root = 55;
    const beat = 0.42;
    const bars = 12;
    const prog = [0, 0, 5, 3, 0, 0, 8, 7, 0, 5, 3, 1];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = startAt + bar * beat * 4;
      const shift = prog[bar];
      for (let i = 0; i < 8; i++) {
        const accent = i % 4 === 0;
        const semis = shift + (i === 6 ? 12 : i === 7 ? 7 : 0);
        this.playPianoNote(noteFreq(root, semis), t0 + i * beat * 0.5, beat * 0.5, accent ? 0.2 : 0.12);
      }
      if (bar % 2 === 0) {
        for (const t of [0, 7, 12 + 3]) this.playPad(noteFreq(root * 2, shift + t), t0, beat * 8, 0.03);
      }
      if (Math.random() < 0.35) {
        const semis = scale[randInt(0, scale.length - 1)] + 24 + shift;
        this.playPianoNote(noteFreq(root, semis), t0 + beat * randInt(1, 3), beat * 2, randRange(0.07, 0.12));
      }
    }
    return bars * beat * 4;
  }

  /** Fase 8.2: voz de colchón: dos sierras desafinadas por un filtro grave, con ataque y caída lentos. */
  private playPad(freq: number, startTime: number, duration: number, velocity: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.min(1200, freq * 3);
    f.Q.value = 0.5;
    const amp = ctx.createGain();
    const attack = Math.min(duration * 0.4, 2.5);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.exponentialRampToValueAtTime(velocity, startTime + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    const oscs: OscillatorNode[] = [];
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      oscs.push(o);
    }
    f.connect(amp);
    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    const wet = ctx.createGain();
    wet.gain.value = 0.8;
    amp.connect(dry).connect(this.destination);
    amp.connect(wet).connect(this.reverbSend);
    const stopAt = startTime + duration + 0.2;
    for (const o of oscs) {
      o.start(startTime);
      o.stop(stopAt);
    }
    this.pending.push(...oscs);
    oscs[0].addEventListener('ended', () => {
      try {
        for (const o of oscs) o.disconnect();
        f.disconnect();
        amp.disconnect();
        dry.disconnect();
        wet.disconnect();
      } catch {
        /* ya desconectado */
      }
      for (const o of oscs) {
        const i = this.pending.indexOf(o);
        if (i >= 0) this.pending.splice(i, 1);
      }
    }, { once: true });
  }

  /** Voz de piano aditiva/FM suave: ataque rápido, caída exponencial, hacia la reverb compartida. */
  private playPianoNote(freq: number, startTime: number, duration: number, velocity: number): void {
    if (this.disposed) return;
    const ctx = this.ctx;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    // Modulador sutil: el "tine" percusivo del ataque, como el golpe del martillo del piano.
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * 2.01;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.5 * velocity, startTime);
    modGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
    modulator.connect(modGain).connect(carrier.frequency);

    // Sobretono de una octava para dar cuerpo tipo piano.
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 2;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.16 * velocity;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.exponentialRampToValueAtTime(Math.max(velocity, 0.0005), startTime + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    carrier.connect(amp);
    overtone.connect(overtoneGain).connect(amp);

    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    amp.connect(dry).connect(this.destination);
    amp.connect(wet).connect(this.reverbSend);

    const stopAt = startTime + duration + 0.3;
    carrier.start(startTime);
    modulator.start(startTime);
    overtone.start(startTime);
    carrier.stop(stopAt);
    modulator.stop(stopAt);
    overtone.stop(stopAt);

    const nodes: AudioScheduledSourceNode[] = [carrier, modulator, overtone];
    this.pending.push(...nodes);
    carrier.addEventListener(
      'ended',
      () => {
        try {
          carrier.disconnect();
          modulator.disconnect();
          overtone.disconnect();
          modGain.disconnect();
          overtoneGain.disconnect();
          amp.disconnect();
          dry.disconnect();
          wet.disconnect();
        } catch {
          /* ya desconectado */
        }
        for (const n of nodes) {
          const idx = this.pending.indexOf(n);
          if (idx >= 0) this.pending.splice(idx, 1);
        }
      },
      { once: true },
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const n of this.pending.splice(0)) {
      try {
        n.stop();
      } catch {
        /* ya detenida */
      }
      try {
        n.disconnect();
      } catch {
        /* ya desconectada */
      }
    }
  }
}
