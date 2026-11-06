// Generative calm "C418-style" music: sampled-by-synthesis instruments (felt piano, warm pad, soft bell)
// plus a seeded composer producing note events. Pure JS (no Web Audio) so it runs in a Worker and in Node.
import { Rng, white, filt, fade, normalize, AD, mix } from './dsp.js';

const TAU = Math.PI * 2;
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ------------------------------------------------------------------ instruments
export const INSTRUMENTS = {
  piano: { sr: 44100, notes: [36, 42, 48, 54, 60, 66, 72, 78, 84, 90], gain: 0.5, release: 0.3 },
  pad: { sr: 22050, notes: [45, 52, 59, 66], gain: 0.13, release: 1.4 },
  bell: { sr: 44100, notes: [72, 79, 86, 93], gain: 0.11, release: 0.6 },
};
export function nearestSample(inst, midi) {
  const ns = INSTRUMENTS[inst].notes; let best = ns[0];
  for (const n of ns) if (Math.abs(n - midi) < Math.abs(best - midi)) best = n;
  return best;
}
// decaying partial added via a complex rotator (fast, no Math.sin per sample)
function partial(out, f, a, tp, ta, mixP, ph, sr, attack = 0) {
  if (f >= sr * 0.47) return;
  const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w);
  let x = Math.cos(ph), y = Math.sin(ph), e1 = a * mixP, e2 = a * (1 - mixP);
  const d1 = Math.exp(-1 / (tp * sr)), d2 = Math.exp(-1 / (ta * sr)), na = attack * sr;
  for (let i = 0; i < out.length; i++) {
    const e = e1 + e2; out[i] += y * (i < na ? e * i / na : e);
    const nx = x * c - y * s; y = x * s + y * c; x = nx; e1 *= d1; e2 *= d2;
    if (e < 2e-6) break;
  }
}
// Soft "felt" piano: inharmonic partials, two detuned strings per partial (beating), two-stage decay, hammer thump.
export function renderPiano(midi, sr = 44100) {
  const r = new Rng(midi * 7919 + 13), f = mtof(midi);
  const dur = clamp(8 - (midi - 36) * 0.075, 3, 8), n = Math.ceil(dur * sr), out = new Float32Array(n);
  const B = 0.00012 * Math.pow(2, (midi - 48) / 15), tau0 = clamp(3.6 * Math.pow(2, -(midi - 48) / 22), 0.7, 6);
  const fc = 700 + f * 1.6, fmax = Math.min(sr * 0.45, 7500);
  for (let k = 1; k <= 28; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k); if (fk > fmax) break;
    const strike = 0.3 + 0.7 * Math.abs(Math.sin(Math.PI * k / 7.3));
    const a = Math.pow(k, -0.85) / (1 + Math.pow(fk / fc, 2)) * strike;
    const tk = tau0 / (1 + 0.16 * (k - 1)) / (1 + fk / 5000);
    for (const det of [-1, 1]) partial(out, fk * (1 + det * r.range(0.00015, 0.0006)), a * 0.5, tk * 0.28, tk * 1.5, 0.6, r.next() * TAU, sr, 0.003);
  }
  // felt hammer thump
  const th = white(Math.ceil(0.05 * sr), r);
  for (let i = 0; i < th.length; i++) th[i] *= AD(i / sr, 0.0015, 0.01);
  filt(th, 'lowpass', clamp(f * 2, 300, 1500), 0.7, 0, sr);
  normalize(out, 1); mix(out, normalize(th, 1), 0, 0.06);
  fade(out, 0, 0.4, sr);
  return normalize(out, 0.85);
}
// Warm analog-ish pad: 3 detuned additive saws through a slowly moving lowpass, slow attack/release.
export function renderPad(midi, sr = 22050) {
  const r = new Rng(midi * 104729 + 7), f = mtof(midi), dur = 12, n = Math.ceil(dur * sr), out = new Float32Array(n);
  const blk = 256, nb = Math.ceil(n / blk) + 1, fcB = new Float32Array(nb), lph = r.next() * TAU;
  for (let b = 0; b < nb; b++) { const t = b * blk / sr; fcB[b] = 450 + 650 * (0.5 + 0.5 * Math.sin(TAU * t / 9 + lph)) * Math.min(1, t / 2.5) + 150; }
  const fmax = Math.min(3500, sr * 0.45);
  for (const [d, vw] of [[-0.0036, 0.55], [0, 1], [0.0032, 0.55]]) {
    for (let k = 1; k * f * (1 + d) < fmax; k++) {
      const fk = k * f * (1 + d), w = TAU * fk / sr, c = Math.cos(w), s = Math.sin(w);
      const th0 = r.next() * TAU; let x = Math.cos(th0), y = Math.sin(th0);
      const side = d === 0 ? 1 : k === 1 ? 0 : k === 2 ? 0.4 : 1;   // stable fundamental, chorus on upper partials
      const gainAt = fc => vw * side / k / Math.sqrt(1 + Math.pow(fk / fc, 4));
      for (let b = 0; b < nb - 1; b++) {
        const g0 = gainAt(fcB[b]), g1 = gainAt(fcB[b + 1]), i0 = b * blk, i1 = Math.min(n, i0 + blk), dg = (g1 - g0) / blk;
        let g = g0;
        for (let i = i0; i < i1; i++) { out[i] += y * g; g += dg; const nx = x * c - y * s; y = x * s + y * c; x = nx; }
      }
    }
  }
  // sub sine
  if (f / 2 > 35) for (let i = 0; i < n; i++) out[i] += 0.25 * Math.sin(TAU * f / 2 * i / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr; let e;
    if (t < 2.2) e = Math.pow(Math.sin(Math.PI / 2 * t / 2.2), 2); else if (t < 8) e = 1; else e = Math.pow(Math.cos(Math.PI / 2 * Math.min(1, (t - 8) / 4)), 2);
    out[i] *= e;
  }
  return normalize(out, 0.8);
}
// Soft celesta/music-box bell
export function renderBell(midi, sr = 44100) {
  const r = new Rng(midi * 31 + 5), f = mtof(midi), n = Math.ceil(3.5 * sr), out = new Float32Array(n);
  const P = [[1, 1, 1.4], [2, 0.22, 0.7], [3, 0.07, 0.4], [4.07, 0.08, 0.32], [5.2, 0.035, 0.18], [6.8, 0.025, 0.1]];
  for (const [k, a, tau] of P) partial(out, f * k * (1 + r.range(-0.0005, 0.0005)), a, tau * 0.5, tau, 0.4, 0, sr, 0.003);
  fade(out, 0, 0.3, sr);
  return normalize(out, 0.8);
}
export function renderInstrumentNote(inst, midi) {
  const sr = INSTRUMENTS[inst].sr;
  const data = inst === 'piano' ? renderPiano(midi, sr) : inst === 'pad' ? renderPad(midi, sr) : renderBell(midi, sr);
  return { sr, chans: [data] };
}

// ------------------------------------------------------------------ composer
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
};
const PROGS = {
  ionian: [[0, 3, 5, 3], [0, 4, 5, 3], [0, 5, 3, 4], [3, 0, 4, 5], [0, 2, 3, 0], [5, 3, 0, 4], [0, 3, 0, 4], [3, 4, 0, 0], [0, 5, 1, 4], [0, 3, 1, 4]],
  lydian: [[0, 1, 0, 1], [0, 1, 5, 4], [0, 1, 2, 1], [0, 4, 1, 0], [5, 1, 0, 0], [0, 1, 4, 0], [0, 2, 1, 0]],
  mixolydian: [[0, 6, 3, 0], [0, 3, 6, 0], [0, 6, 0, 3], [3, 6, 0, 0]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 2, 3, 4], [0, 3, 6, 0], [0, 4, 3, 0]],
  aeolian: [[0, 5, 2, 6], [0, 5, 3, 4], [5, 6, 0, 0], [0, 3, 5, 6], [0, 5, 6, 0]],
};
// left-hand arpeggio patterns (eighth-note slots, index into voicing; -1 = rest)
const ARP4 = [
  [0, 2, 3, 4, 2, 3, 4, 3], [0, -1, 2, -1, 3, -1, 4, -1], [0, 3, 4, 3, 1, 3, 4, 3], [0, -1, -1, 3, -1, 4, -1, -1],
  [0, 2, 4, 5, -1, 4, 2, -1], [0, 1, 2, 3, 5, 3, 2, 1], [0, -1, 3, 4, -1, -1, 2, -1],
];
const ARP3 = [[0, 2, 3, 4, 3, 2], [0, -1, 3, -1, 4, -1], [0, 3, 4, 5, 4, 3], [0, 2, 4, 2, 3, 2], [0, -1, 2, 3, 4, -1]];
const SPARSE4 = [[0, -1, -1, -1, 3, -1, -1, -1], [0, -1, -1, 2, -1, -1, 4, -1], [0, -1, -1, -1, -1, -1, -1, -1]];
const SPARSE3 = [[0, -1, -1, 3, -1, -1], [0, -1, -1, -1, -1, -1], [0, -1, 2, -1, -1, -1]];
const RHY4 = [[2, 2], [1, 1, 2], [3, 1], [2, 1, 1], [1.5, 0.5, 2], [4], [1, 2, 1], [0.5, 0.5, 1, 2], [-1, 1, 2], [-2, 1, 1]];
const RHY3 = [[2, 1], [3], [1, 1, 1], [1, 2], [1.5, 0.5, 1], [-1, 2], [-1, 1, 1]];

const degMidi = (scale, tonic, d) => tonic + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7];

/**
 * composePiece(seed, { kind:'game'|'menu', short, night, biome }) -> { events:[{t,inst,midi,vel,dur,pan}], duration, info }
 */
export function composePiece(seed, opts = {}) {
  const r = new Rng(seed);
  const kind = opts.kind || 'game', short = !!opts.short, night = !!opts.night, biome = opts.biome || '';
  let mw = { ionian: 3, lydian: 3, mixolydian: 1, dorian: 1, aeolian: 0.5 };
  if (night) mw = { ionian: 1.5, lydian: 2, mixolydian: 0.5, dorian: 2.5, aeolian: 2 };
  if (/nether/.test(biome)) mw = { dorian: 1, aeolian: 3 };
  if (/desert|savanna|badlands/.test(biome)) mw.mixolydian = 3;
  const mode = r.weighted(mw), scale = MODES[mode], prog = r.pick(PROGS[mode]);
  const pc = r.int(0, 11), bassTonic = 36 + pc > 45 ? 24 + pc : 36 + pc;              // tonic bass in 36..45
  const melTonic = bassTonic + (bassTonic + 24 < 60 ? 36 : 24);                          // melody tonic in 60..71
  const meter = r.chance(kind === 'menu' ? 0.2 : 0.3) ? 3 : 4;
  let bpm = kind === 'menu' ? r.range(56, 68) : r.range(62, 80); if (night) bpm -= 6; if (/nether/.test(biome)) bpm -= 8;
  const spb = 60 / bpm, chordBars = meter === 3 ? 2 : r.chance(0.6) ? 2 : 1;
  const barSec = meter * spb, cycleSec = 4 * chordBars * barSec;
  const hasPad = r.chance(kind === 'menu' ? 0.9 : night ? 0.65 : 0.45) || /nether/.test(biome);
  const padIntro = kind === 'menu' || r.chance(0.5);
  const bellsOk = !/nether/.test(biome);
  const target = short ? r.range(45, 75) : kind === 'menu' ? r.range(110, 170) : r.range(120, 210);
  const nCyc = Math.max(2, Math.round(target / cycleSec));
  // form: intro, A, then a varied middle (A2 = motif variant, B = second motif higher + bells, brk = accompaniment only), outro
  const mid = ['A2', 'B', 'brk', 'A', 'B', 'A2', 'brk', 'B'];
  const plan = nCyc === 2 ? ['introA', 'outro'] : ['intro', 'A', ...mid.slice(0, nCyc - 3), 'outro'];
  const arps = meter === 4 ? ARP4 : ARP3, sparse = meter === 4 ? SPARSE4 : SPARSE3, rhy = meter === 4 ? RHY4 : RHY3;
  const mainArp = r.pick(arps), altArp = r.pick(arps), introArp = r.chance(0.5) ? r.pick(sparse) : mainArp;
  // voicing for a chord degree: root, 5th, 9th(or octave), 10th, 12th, 14th
  const voicing = d => {
    let v = [0, 4, 8, 9, 11, 13].map(o => degMidi(scale, bassTonic, d + o));
    if (((v[2] - v[0]) % 12) === 1) v[2] = v[0] + 12;               // avoid b9
    if (v[1] - v[0] !== 7) v[1] = v[0] + 7;                         // keep a perfect fifth in the bass
    if (v[0] > 47) v = v.map(x => x - 12);
    return v;
  };
  const chordPcs = d => [0, 2, 4, 6].map(o => ((d + o) % 7 + 7) % 7); // scale degrees (mod 7) of the 7th chord
  // melodic motif: [{b, d, s}] beats/duration/step, relative to anchor
  const mkMotif = () => {
    const beats = meter * chordBars, out = []; let b = 0, s = 0;
    while (b < beats - 0.01) {
      const cell = r.pick(rhy);
      for (const x of cell) {
        if (b >= beats - 0.01) break;
        const d = Math.min(Math.abs(x), beats - b);
        if (x > 0 && !(b > 0 && r.chance(0.12))) { out.push({ b, d, s }); s = clamp(s + r.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]), -3, 4); }
        b += d;
      }
    }
    if (!out.length) out.push({ b: 0, d: meter, s: 0 });
    return out;
  };
  const motifA = mkMotif(), motifB = mkMotif(), motifA2 = motifA.map(n => ({ ...n }));
  if (motifA2.length > 1) motifA2[motifA2.length - 1].s += r.pick([-2, -1, 1, 2]);
  const events = [];
  const push = (t, inst, midi, vel, dur, pan) => events.push({ t: Math.max(0, t + r.gauss() * 0.006), inst, midi, vel: clamp(vel, 0.02, 1), dur, pan });
  let t = r.range(0.2, 0.6), melDeg = 6, barIdx = 0;
  const totalBars = plan.length * 4 * chordBars;
  const tempoAt = bi => (bi >= totalBars - 2 ? (bi === totalBars - 1 ? 1.32 : 1.15) : 1) * (1 + r.range(-0.015, 0.015));
  for (let si = 0; si < plan.length; si++) {
    const sec = plan[si];
    const dyn = { intro: 0.75, introA: 0.8, A: 0.9, A2: 0.92, B: 1.0, brk: 0.8, outro: 0.72 }[sec];
    const arp = sec === 'intro' ? introArp : sec === 'B' ? altArp : sec === 'brk' ? (r.chance(0.5) ? introArp : altArp) : sec === 'outro' ? (r.chance(0.5) ? introArp : mainArp) : mainArp;
    const melody = !['intro', 'outro', 'brk'].includes(sec) || (sec === 'outro' && r.chance(0.3));
    const motif = sec === 'B' ? motifB : sec === 'A2' ? motifA2 : motifA;
    const center = sec === 'B' ? 8 : 6, lo = 2, hi = 11;   // melody register (scale degrees above melTonic): above the arpeggios
    for (let ci = 0; ci < 4; ci++) {
      const cd = prog[ci], v = voicing(cd), pcs = chordPcs(cd);
      const lastChord = si === plan.length - 1 && ci === 3;
      const cStart = t; let cDur = 0; const bars = [];
      for (let b = 0; b < chordBars; b++) { const bd = barSec * tempoAt(barIdx + b); bars.push([cStart + cDur, bd]); cDur += bd; }
      const cEnd = cStart + cDur;
      if (lastChord) {
        // final tonic chord, rolled, long ring
        const fv = voicing(0), roll = r.range(0.035, 0.06);
        [0, 1, 2, 3, 5].forEach((k, i) => push(cStart + i * roll, 'piano', fv[k], 0.34 * dyn + (i ? 0 : 0.05), 7, (fv[k] - 62) / 60));
        push(cStart + 5 * roll + 0.05, 'piano', degMidi(scale, melTonic, r.pick([0, 2, 4])), 0.4 * dyn, 7, 0.2);
        if (hasPad) [0, 2, 4].forEach((o, i) => push(cStart, 'pad', degMidi(scale, bassTonic + 12, o), 0.5, 8, i === 0 ? 0 : i === 1 ? -0.3 : 0.3));
        t = cEnd; barIdx += chordBars; break;
      }
      // pad
      if (hasPad && (sec !== 'intro' || padIntro)) {
        const pd = [0, 2, 4, r.chance(0.5) ? 6 : 8].map(o => degMidi(scale, bassTonic + 12, cd + o));
        const pdn = pd.map(x => (x > 67 ? x - 12 : x));
        pdn.forEach((m, i) => push(cStart, 'pad', m, 0.48 * dyn, cDur + 0.6, [-0.35, 0.35, -0.15, 0.15][i]));
      }
      // arpeggio / left hand
      bars.forEach(([bs, bd], bi) => {
        const slot = bd / (meter * 2);
        const thin = sec === 'outro' ? 0.25 + 0.45 * ci / 3 : sec === 'intro' && ci === 0 && bi === 0 ? 0.0 : 0;
        arp.forEach((ix, k) => {
          if (ix < 0 || (k > 0 && r.chance(thin))) return;
          if (sec === 'introA' && ci < 2 && k % 2 === 1) return;
          const m = v[Math.min(ix, v.length - 1)];
          const vel = (0.27 + (k === 0 ? 0.07 : 0) + (ix === 0 ? 0.03 : 0)) * dyn * r.range(0.9, 1.06);
          push(bs + k * slot, 'piano', m, vel, Math.max(0.5, cEnd - (bs + k * slot)) + 0.12, clamp((m - 62) / 60, -0.4, 0.4));
        });
      });
      // melody (phrase: motif on chords 0-2, cadence or rest on chord 3)
      if (melody) {
        const beatSec = cDur / (meter * chordBars);
        if (ci < 3 || r.chance(0.35)) {
          // anchor: chord tone nearest to previous melody degree
          const cands = [];
          for (let d = -3; d <= 11; d++) if (pcs.slice(0, 3).includes(((d % 7) + 7) % 7)) cands.push(d);
          const target = 0.55 * melDeg + 0.45 * center;
          const anchor = cands.filter(d => d >= lo + 1 && d <= hi - 2).reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a, center);
          const notes = ci === 3 ? [{ b: 0, d: meter * chordBars * 0.75, s: 0 }] : motif;
          for (const n of notes) {
            let d = anchor + n.s;
            while (d > hi) d -= 2; while (d < lo) d += 2;          // reflect into range (keeps motion, no stuck notes)
            const strong = n.b % meter === 0 || n.d >= 2;
            if (strong && !pcs.includes(((d % 7) + 7) % 7)) d += (pcs.includes((((d + 1) % 7) + 7) % 7) && d < hi) ? 1 : -1;
            const m = degMidi(scale, melTonic, d);
            const st = cStart + n.b * beatSec, dur = Math.min(n.d * beatSec + 0.6, cEnd - st + 0.4);
            push(st, 'piano', m, (0.44 + (strong ? 0.05 : 0)) * dyn * r.range(0.92, 1.06), dur, clamp((m - 62) / 60, -0.4, 0.4));
            melDeg = d;
          }
        }
      }
      // bells: sparse sparkles in B or menu pieces
      if (bellsOk && (sec === 'B' || sec === 'brk' || (kind === 'menu' && sec === 'A2')) && r.chance(sec === 'brk' ? 0.35 : 0.6)) {
        for (let k = r.int(1, 3); k > 0; k--) {
          const m = degMidi(scale, melTonic + 12, r.pick([0, 2, 4, 7]) + cd);
          push(cStart + r.int(0, meter * chordBars - 1) * (cDur / (meter * chordBars)), 'bell', clamp(m, 72, 98), r.range(0.25, 0.4), 2.5, r.range(-0.4, 0.4));
        }
      }
      t = cEnd; barIdx += chordBars;
    }
  }
  events.sort((a, b) => a.t - b.t);
  const duration = events.reduce((m, e) => Math.max(m, e.t + Math.min(e.dur, 7)), 0) + 2;
  return { events, duration, info: { mode, key: pc, bpm: Math.round(bpm), meter, chordBars, prog, plan, hasPad, kind, short } };
}

// ------------------------------------------------------------------ offline mixer (Node preview / tests)
// samples: { piano: {midi: Float32Array}, ... } at INSTRUMENTS[inst].sr
export function mixPiece(piece, samples, sr = 44100) {
  const n = Math.ceil(piece.duration * sr), L = new Float32Array(n), R = new Float32Array(n);
  for (const ev of piece.events) {
    const I = INSTRUMENTS[ev.inst], sm = nearestSample(ev.inst, ev.midi), data = samples[ev.inst][sm];
    const rate = Math.pow(2, (ev.midi - sm) / 12) * I.sr / sr, g = I.gain * ev.vel;
    const p = clamp(ev.pan || 0, -1, 1), gl = Math.cos((p + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((p + 1) * Math.PI / 4) * Math.SQRT2;
    const s0 = Math.floor(ev.t * sr), relN = I.release * sr;
    for (let i = 0; s0 + i < n; i++) {
      const pos = i * rate, k = pos | 0; if (k + 1 >= data.length) break;
      let x = data[k] + (data[k + 1] - data[k]) * (pos - k);
      const tt = i / sr; if (tt > ev.dur) { const e = Math.exp(-(i - ev.dur * sr) / relN); if (e < 1e-4) break; x *= e; }
      L[s0 + i] += x * g * gl; R[s0 + i] += x * g * gr;
    }
  }
  return [L, R];
}
