// Procedural sound bank: pure functions producing Float32Array sample buffers (44.1 kHz mono unless noted).
// Every recipe is `gen(rng, variantIndex) -> Float32Array | [L, R]`. No Web Audio here, so it runs in a Worker
// and in Node (tools/test_audio.mjs).
import {
  SR, Rng, hashStr, alloc, white, pink, brown, normalize, mix, fade, reverse, saturate, applyEnv, trimTail,
  loopify, AD, kf, filt, sweep, addTone, addChirp, addNoise, grains, modal, pluck, voice, freeverb, peak,
} from './dsp.js';

const TAU = Math.PI * 2;
const N = s => Math.ceil(s * SR);

// ------------------------------------------------------------------ helpers
// sum of attack/decay "lumps": [[t0, amp, attack, decay], ...]
const lumps = L => t => { let s = 0; for (let i = 0; i < L.length; i++) { const l = L[i]; s += l[1] * AD(t - l[0], l[2], l[3]); } return s; };
// grain layer normalised to peak 1
function G(D, r, env, o) { const b = alloc(D); grains(b, r, { dur: D, env, ...o }); return normalize(b, 1); }
// enveloped noise layer (white|pink|brown), optionally filtered: flt = [[type,f,q,gain],...]
function Nz(D, r, env, color = 'white', flt = []) {
  const b = (color === 'pink' ? pink : color === 'brown' ? brown : white)(N(D), r);
  applyEnv(b, env);
  for (const f of flt) filt(b, f[0], f[1], f[2] ?? 0.7071, f[3] ?? 0);
  return normalize(b, 1);
}
// modal knock(s): hits = [[t, amp], ...]
function knock(D, r, hits, modes, excMs = 1.2) {
  const exc = alloc(D);
  for (const [t, a] of hits) addNoise(exc, t * SR, Math.max(2, excMs * SR / 1000), a, r, 0.05);
  return normalize(modal(exc, modes), 1);
}
// free-free bar ratios (wood), tuned per call
const barModes = (f1, r, taus = [0.07, 0.04, 0.022, 0.012], amps = [1, 0.55, 0.3, 0.15], ratios = [1, 2.76, 5.4, 8.93]) =>
  ratios.map((k, i) => ({ f: f1 * k * r.range(0.97, 1.03), a: amps[i] ?? 0.1, tau: taus[i] ?? 0.01 }));
const out0 = D => alloc(D);
function finish(b, o = {}) {
  if (o.hp) filt(b, 'highpass', o.hp, 0.7071);
  if (o.lp) filt(b, 'lowpass', o.lp, 0.7071);
  for (const p of o.peaks || []) filt(b, 'peaking', p[0], p[1], p[2]);
  return b;
}
// Bubble: Minnaert-like rising chirp. f in Hz, rising by `rise` fraction during its life.
function bubble(b, t, f, amp, r, rise = 0.6, tau = null) {
  const tt = tau ?? Math.min(0.06, Math.max(0.006, 12 / f));
  addChirp(b, t * SR, f, f * (1 + rise), tt, amp, tt * 2.5, SR, 0.0015);
}

// ------------------------------------------------------------------ block materials
// Generic crunchy material (grass/gravel/sand/snow/cloth). p: { L: lump list, layers: [grain opts + g], body:{g,color,flt}, thump }
function material(r, D, p) {
  const env = lumps(p.L), out = out0(D);
  for (const g of p.layers) mix(out, G(D, r, env, g), 0, g.g);
  if (p.body) {
    let e2 = env;
    if (p.body.flutter) { const fl = flutter(N(D), r, 160); e2 = t => env(t) * fl[Math.min(fl.length - 1, (t * SR) | 0)]; }
    mix(out, Nz(D, r, e2, p.body.color, p.body.flt), 0, p.body.g);
  }
  if (p.thump) addTone(out, 0, p.thump[0] * r.range(0.9, 1.1), p.thump[1], p.thump[2] * peak(out), Math.PI / 2);
  return finish(out, p);
}
const jit = (r, a, b) => r.range(a, b);
// slowly varying random amplitude modulation in [lo,1] (lowpassed noise)
function flutter(n, r, fc, lo = 0.15) {
  const b = white(n, r); filt(b, 'lowpass', fc, 0.7); filt(b, 'lowpass', fc, 0.7); normalize(b, 1);
  for (let i = 0; i < n; i++) b[i] = lo + (1 - lo) * Math.abs(b[i]);
  return b;
}

function digGrass(r) {
  const D = 0.48, t2 = jit(r, 0.08, 0.15), t3 = t2 + jit(r, 0.07, 0.12);
  return material(r, D, {
    L: [[0, 1, 0.004, 0.035], [t2, 0.8, 0.007, 0.045], [t3, 0.45, 0.01, 0.05], [0, 0.18, 0.03, 0.14]],
    layers: [
      { g: 1.0, rate: 5000, fLo: 900, fHi: 8000, tauLo: 0.00012, tauHi: 0.0008, pow: 2.4 },
      { g: 0.55, rate: 700, fLo: 260, fHi: 1800, tauLo: 0.0008, tauHi: 0.004, pow: 2 },
    ],
    body: { g: 0.3, flt: [['bandpass', 2600, 0.5]] }, thump: [130, 0.02, 0.25],
    hp: 160, peaks: [[3200, 0.8, 3]],
  });
}
function stepGrass(r) {
  const D = 0.26, t2 = jit(r, 0.03, 0.06);
  return material(r, D, {
    L: [[0, 1, 0.004, 0.03], [t2, 0.55, 0.006, 0.04]],
    layers: [
      { g: 1.0, rate: 4000, fLo: 900, fHi: 7000, tauLo: 0.00012, tauHi: 0.0007, pow: 2.4 },
      { g: 0.45, rate: 500, fLo: 250, fHi: 1500, tauLo: 0.0008, tauHi: 0.003, pow: 2 },
    ],
    body: { g: 0.3, flt: [['bandpass', 2200, 0.5]] }, hp: 220, peaks: [[3000, 0.8, 2]],
  });
}
function digGravel(r) {
  const D = 0.52, t2 = jit(r, 0.09, 0.14), t3 = t2 + jit(r, 0.09, 0.13);
  const p = {
    L: [[0, 1, 0.005, 0.05], [t2, 0.85, 0.01, 0.06], [t3, 0.5, 0.01, 0.07], [0, 0.25, 0.04, 0.15]],
    layers: [
      { g: 0.6, rate: 2500, fLo: 600, fHi: 6000, tauLo: 0.0002, tauHi: 0.0012, pow: 2.2 },
      { g: 1.0, rate: 1600, fLo: 220, fHi: 3200, tauLo: 0.0008, tauHi: 0.005, pow: 1.8 },
      { g: 0.45, rate: 140, fLo: 1500, fHi: 4500, tauLo: 0.002, tauHi: 0.006, pow: 1.4 },
    ],
    body: { g: 0.3, color: 'pink', flt: [['bandpass', 800, 0.6]] }, thump: [110, 0.025, 0.3], hp: 110, lp: 9000,
  };
  return material(r, D, p);
}
function stepGravel(r) {
  const D = 0.3, t2 = jit(r, 0.035, 0.07);
  return material(r, D, {
    L: [[0, 1, 0.004, 0.04], [t2, 0.6, 0.006, 0.05]],
    layers: [
      { g: 0.55, rate: 2200, fLo: 600, fHi: 6000, tauLo: 0.0002, tauHi: 0.0012, pow: 2.2 },
      { g: 1.0, rate: 1400, fLo: 220, fHi: 3000, tauLo: 0.0008, tauHi: 0.004, pow: 1.8 },
      { g: 0.35, rate: 120, fLo: 1500, fHi: 4500, tauLo: 0.002, tauHi: 0.005, pow: 1.4 },
    ],
    body: { g: 0.28, color: 'pink', flt: [['bandpass', 800, 0.6]] }, thump: [120, 0.02, 0.25], hp: 120, lp: 9000,
  });
}
function digSand(r) {
  const D = 0.45, t2 = jit(r, 0.1, 0.16);
  return material(r, D, {
    L: [[0, 1, 0.025, 0.09], [t2, 0.65, 0.03, 0.08]],
    layers: [
      { g: 0.55, rate: 9000, fLo: 2000, fHi: 10000, tauLo: 0.0001, tauHi: 0.0004, pow: 2.6 },
      { g: 0.2, rate: 250, fLo: 400, fHi: 1500, tauLo: 0.001, tauHi: 0.003, pow: 2 },
    ],
    body: { g: 1.0, color: 'white', flutter: true, flt: [['highpass', 1300, 0.6], ['lowpass', 8500, 0.6]] },
    hp: 500, peaks: [[4500, 0.7, 2]],
  });
}
function stepSand(r) {
  const D = 0.26, t2 = jit(r, 0.04, 0.07);
  return material(r, D, {
    L: [[0, 1, 0.018, 0.05], [t2, 0.5, 0.02, 0.05]],
    layers: [
      { g: 0.5, rate: 8000, fLo: 2000, fHi: 10000, tauLo: 0.0001, tauHi: 0.0004, pow: 2.6 },
      { g: 0.2, rate: 200, fLo: 400, fHi: 1400, tauLo: 0.001, tauHi: 0.003, pow: 2 },
    ],
    body: { g: 1.0, flutter: true, flt: [['highpass', 1200, 0.6], ['lowpass', 8000, 0.6]] }, hp: 450,
  });
}
function digSnow(r) {
  const D = 0.46, t2 = jit(r, 0.09, 0.15), t3 = t2 + jit(r, 0.07, 0.11);
  return material(r, D, {
    L: [[0, 1, 0.01, 0.05], [t2, 0.8, 0.012, 0.06], [t3, 0.5, 0.012, 0.06]],
    layers: [
      { g: 0.8, rate: 3500, fLo: 500, fHi: 3500, tauLo: 0.0002, tauHi: 0.0012, pow: 2 },
      { g: 0.6, rate: 800, fLo: 200, fHi: 1200, tauLo: 0.001, tauHi: 0.004, pow: 2 },
    ],
    body: { g: 0.45, flt: [['lowpass', 1800, 0.6]] }, hp: 120, lp: 4200,
  });
}
function stepSnow(r) {
  const D = 0.28, t2 = jit(r, 0.04, 0.07);
  return material(r, D, {
    L: [[0, 1, 0.008, 0.045], [t2, 0.55, 0.01, 0.05]],
    layers: [
      { g: 0.8, rate: 3000, fLo: 500, fHi: 3200, tauLo: 0.0002, tauHi: 0.0012, pow: 2 },
      { g: 0.55, rate: 700, fLo: 200, fHi: 1100, tauLo: 0.001, tauHi: 0.004, pow: 2 },
    ],
    body: { g: 0.45, flt: [['lowpass', 1700, 0.6]] }, hp: 130, lp: 4000,
  });
}
function digCloth(r) {
  const D = 0.34, t2 = jit(r, 0.05, 0.09);
  return material(r, D, {
    L: [[0, 1, 0.012, 0.06], [t2, 0.5, 0.02, 0.07]],
    layers: [{ g: 0.22, rate: 1500, fLo: 600, fHi: 2500, tauLo: 0.0003, tauHi: 0.001, pow: 2.5 }],
    body: { g: 1.0, flt: [['lowpass', 750, 0.6], ['lowpass', 1100, 0.6]] }, thump: [105, 0.03, 0.5], hp: 55, lp: 1700,
  });
}
function stepCloth(r) {
  const D = 0.22, t2 = jit(r, 0.03, 0.05);
  return material(r, D, {
    L: [[0, 1, 0.012, 0.045], [t2, 0.4, 0.015, 0.04]],
    layers: [{ g: 0.18, rate: 1200, fLo: 600, fHi: 2200, tauLo: 0.0003, tauHi: 0.001, pow: 2.5 }],
    body: { g: 1.0, flt: [['lowpass', 700, 0.6], ['lowpass', 1000, 0.6]] }, thump: [115, 0.025, 0.4], hp: 60, lp: 1500,
  });
}
// stone: bright clack + gritty crumble
function digStone(r) {
  const D = 0.4, t2 = jit(r, 0.045, 0.085), t3 = t2 + jit(r, 0.05, 0.09);
  const env = lumps([[0, 1, 0.002, 0.03], [t2, 0.55, 0.004, 0.04], [t3, 0.3, 0.005, 0.05], [0, 0.12, 0.01, 0.12]]);
  const out = out0(D);
  const modes = [
    { f: r.range(650, 950), tau: 0.025, a: 0.8 }, { f: r.range(1400, 1900), tau: 0.018, a: 1 },
    { f: r.range(2500, 3200), tau: 0.012, a: 0.7 }, { f: r.range(3800, 4700), tau: 0.008, a: 0.45 },
  ];
  mix(out, knock(D, r, [[0, 1], [t2, 0.45], [t3, 0.25]], modes, 1.0), 0, 0.55);
  mix(out, G(D, r, env, { rate: 2500, fLo: 1000, fHi: 7000, tauLo: 0.0002, tauHi: 0.001, pow: 2.3 }), 0, 0.6);
  mix(out, G(D, r, env, { rate: 1500, fLo: 500, fHi: 4000, tauLo: 0.0006, tauHi: 0.003, pow: 2 }), 0, 0.9);
  mix(out, Nz(D, r, env, 'white', [['bandpass', 1800, 0.6]]), 0, 0.22);
  addTone(out, 0, r.range(140, 180), 0.015, 0.3, Math.PI / 2);
  return finish(out, { hp: 140 });
}
function stepStone(r) {
  const D = 0.2, t2 = jit(r, 0.018, 0.035);
  const env = lumps([[0, 1, 0.0015, 0.016], [t2, 0.35, 0.003, 0.02]]);
  const out = out0(D);
  const modes = [
    { f: r.range(1100, 1500), tau: 0.012, a: 1 }, { f: r.range(2300, 2900), tau: 0.009, a: 0.7 },
    { f: r.range(3600, 4400), tau: 0.006, a: 0.45 }, { f: r.range(500, 700), tau: 0.012, a: 0.5 },
  ];
  mix(out, knock(D, r, [[0, 1], [t2, 0.3]], modes, 0.8), 0, 0.75);
  mix(out, G(D, r, env, { rate: 1500, fLo: 1200, fHi: 7000, tauLo: 0.0002, tauHi: 0.0008, pow: 2.2 }), 0, 0.4);
  mix(out, G(D, r, env, { rate: 1000, fLo: 500, fHi: 3500, tauLo: 0.0005, tauHi: 0.0025, pow: 2 }), 0, 0.6);
  addTone(out, 0, r.range(190, 240), 0.01, 0.35, Math.PI / 2);
  return finish(out, { hp: 200 });
}
// wood: hollow knock + splintery crackle
function digWood(r) {
  const D = 0.45, t2 = jit(r, 0.05, 0.1);
  const out = out0(D), f1 = r.range(170, 250);
  const modes = barModes(f1, r, [0.05, 0.035, 0.02, 0.012]).concat([{ f: r.range(380, 520), a: 0.8, tau: 0.028 }, { f: r.range(800, 1100), a: 0.4, tau: 0.015 }]);
  mix(out, knock(D, r, [[0, 1], [t2, 0.55]], modes, 1.5), 0, 1);
  const env = lumps([[0, 1, 0.002, 0.03], [t2, 0.8, 0.003, 0.04], [t2 + 0.05, 0.3, 0.01, 0.05]]);
  mix(out, G(D, r, env, { rate: 2200, fLo: 1200, fHi: 6000, tauLo: 0.0002, tauHi: 0.0012, pow: 2.3 }), 0, 0.5);
  mix(out, G(D, r, env, { rate: 400, fLo: 500, fHi: 1600, tauLo: 0.002, tauHi: 0.006, pow: 1.8 }), 0, 0.35);
  return finish(out, { hp: 70, peaks: [[300, 1, 2]] });
}
function stepWood(r) {
  const D = 0.22, out = out0(D), f1 = r.range(210, 300);
  const modes = barModes(f1, r, [0.05, 0.028, 0.015, 0.008], [1, 0.5, 0.25, 0.1]).concat([{ f: r.range(420, 560), a: 0.6, tau: 0.02 }]);
  mix(out, knock(D, r, [[0, 1]], modes, 1.2), 0, 1);
  const env = lumps([[0, 1, 0.001, 0.012]]);
  mix(out, G(D, r, env, { rate: 1200, fLo: 1500, fHi: 6000, tauLo: 0.0002, tauHi: 0.0008, pow: 2 }), 0, 0.18);
  return finish(out, { hp: 90 });
}
function stepLadder(r) {
  const D = 0.2, out = out0(D), f1 = r.range(380, 470);
  const modes = [1, 2.4, 4.1, 6.3].map((k, i) => ({ f: f1 * k * r.range(0.97, 1.03), a: [1, 0.6, 0.4, 0.2][i], tau: [0.032, 0.02, 0.012, 0.008][i] }));
  mix(out, knock(D, r, [[0, 1], [r.range(0.012, 0.02), 0.25]], modes, 0.8), 0, 1);
  return finish(out, { hp: 150 });
}
// glass shatter: crash + tinkling shards
function digGlass(r) {
  const D = 1.15, out = out0(D);
  mix(out, G(D, r, lumps([[0, 1, 0.001, 0.025], [0.012, 0.5, 0.002, 0.06]]), { rate: 14000, fLo: 2200, fHi: 15000, tauLo: 0.0005, tauHi: 0.004, pow: 1.6 }), 0, 0.8);
  mix(out, Nz(D, r, t => AD(t, 0.0008, 0.022), 'white', [['highpass', 2500, 0.7]]), 0, 0.5);
  const sh = alloc(D), n = r.int(30, 46);
  for (let k = 0; k < n; k++) {
    const t = 0.008 + Math.pow(r.next(), 1.7) * 0.9, a = Math.pow(1 - t / D, 1.6) * r.range(0.25, 1);
    const base = r.exp(2400, 9000), nm = r.int(2, 4);
    const ping = (tt, aa) => { for (let m = 0; m < nm; m++) addTone(sh, tt * SR, base * (m === 0 ? 1 : r.range(1.4, 2.9)), r.exp(0.01, 0.07), aa * (m === 0 ? 1 : r.range(0.25, 0.7)), r.next() * TAU); };
    ping(t, a);
    if (r.chance(0.35)) ping(t + r.range(0.025, 0.07), a * 0.4);
  }
  mix(out, normalize(sh, 1), 0, 0.75);
  addTone(out, 0, r.range(220, 300), 0.02, 0.25, Math.PI / 2);
  return finish(out, { hp: 700, lp: 15000 });
}
// metal: clanky inharmonic impact with short ring + grit
function metalHit(r, D, base, ringScale, grit) {
  const out = out0(D), t2 = r.range(0.02, 0.05);
  const ratios = [1, 2.32, 4.25, 6.63, 9.38, 12.6], taus = [0.22, 0.16, 0.11, 0.07, 0.045, 0.03];
  const modes = ratios.map((k, i) => ({ f: base * k * r.range(0.97, 1.03), a: 1 / (1 + i * 0.5), tau: taus[i] * ringScale }));
  mix(out, knock(D, r, [[0, 1], [t2, 0.35]], modes, 0.8), 0, 0.85);
  const env = lumps([[0, 1, 0.0015, 0.02], [t2, 0.4, 0.002, 0.03]]);
  mix(out, G(D, r, env, { rate: 2000, fLo: 1500, fHi: 8000, tauLo: 0.0003, tauHi: 0.0015, pow: 2 }), 0, grit);
  addTone(out, 0, base * 0.5, 0.02, 0.3, Math.PI / 2);
  return finish(out, { hp: 120 });
}
const digMetal = r => metalHit(r, 0.5, r.range(330, 430), 0.65, 0.5);
const stepMetal = r => metalHit(r, 0.3, r.range(520, 680), 0.4, 0.3);

// ------------------------------------------------------------------ UI / player / items
function click(r) {
  const D = 0.09, out = out0(D);
  const modes = [{ f: 2150, tau: 0.004, a: 1 }, { f: 3900, tau: 0.0028, a: 0.55 }, { f: 950, tau: 0.007, a: 0.7 }, { f: 5800, tau: 0.0014, a: 0.35 }];
  mix(out, knock(D, r, [[0, 1]], modes, 0.4), 0, 1);
  addTone(out, 0, 420, 0.006, 0.25, Math.PI / 2);
  return finish(out, { hp: 150 });
}
function pop(r) {
  const D = 0.13, out = out0(D);
  let ph = 0; const f0 = r.range(480, 560), f1 = f0 * r.range(2.1, 2.4);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, f = f1 - (f1 - f0) * Math.exp(-t / 0.012);
    ph += TAU * f / SR; const e = Math.min(1, t / 0.002) * Math.exp(-t / 0.028);
    out[i] = (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * e;
  }
  addNoise(out, 0, 0.0015 * SR, 0.15, r, 0.1);
  return finish(out, { hp: 180 });
}
function toolBreak(r) {
  const D = 0.45, out = out0(D);
  mix(out, G(D, r, lumps([[0, 1, 0.001, 0.012], [0.025, 0.6, 0.002, 0.02]]), { rate: 16000, fLo: 900, fHi: 8000, tauLo: 0.0001, tauHi: 0.0008, pow: 1.8 }), 0, 0.9);
  const f = r.range(2600, 3400);
  addTone(out, 0.003 * SR, f, 0.07, 0.35, 0); addTone(out, 0.003 * SR, f * 2.43, 0.035, 0.2, 0); addTone(out, 0.003 * SR, f * 0.52, 0.05, 0.25, 0);
  mix(out, knock(D, r, [[0, 1]], barModes(r.range(550, 750), r, [0.03, 0.018, 0.01, 0.006]), 1), 0, 0.5);
  mix(out, G(D, r, t => AD(t - 0.04, 0.01, 0.09), { rate: 800, fLo: 1500, fHi: 6000, tauLo: 0.0005, tauHi: 0.003, pow: 2 }), 0, 0.35);
  return finish(out, { hp: 200 });
}
function eat(r) {
  const D = 0.3, t2 = r.range(0.05, 0.09), t3 = t2 + r.range(0.04, 0.08);
  const env = lumps([[0, 1, 0.003, 0.03], [t2, 0.75, 0.004, 0.035], [t3, 0.4, 0.004, 0.03]]);
  const out = out0(D);
  mix(out, G(D, r, env, { rate: 4500, fLo: 500, fHi: 5000, tauLo: 0.0002, tauHi: 0.0018, pow: 2 }), 0, 1);
  mix(out, G(D, r, env, { rate: 120, fLo: 700, fHi: 1800, tauLo: 0.002, tauHi: 0.006, pow: 1.5 }), 0, 0.4);
  mix(out, Nz(D, r, env, 'pink', [['lowpass', 1600, 0.7]]), 0, 0.3);
  return finish(out, { hp: 150, lp: 6500, peaks: [[800, 1, 5], [1900, 1.2, 3]] });
}
function burp(r) {
  const D = r.range(0.45, 0.6), f = r.range(0.9, 1.1);
  const b = normalize(voice(r, {
    dur: D, f0: kf([0, 92 * f], [0.3, 104 * f], [1, 68 * f]), amp: kf([0, 0], [0.08, 1], [0.55, 0.8], [1, 0]),
    F: [kf([0, 480], [0.3, 640], [1, 450]), kf([0, 880], [0.4, 1020], [1, 820]), 2400, 3300], BW: [170, 190, 260, 300],
    jitter: 0.12, shimmer: 0.3, sub: 0.5, breath: 0.15, growl: 0.5, growlRate: 34, oq: 0.4,
  }), 1);
  return finish(b, { lp: 3500, hp: 60 });
}
function drink(r) {
  const D = 0.6, out = out0(D), gulps = [0.01, r.range(0.2, 0.27)];
  if (r.chance(0.4)) gulps.push(gulps[1] + r.range(0.18, 0.24));
  for (const t of gulps) {
    const f = r.range(170, 230);
    addChirp(out, t * SR, f, f * 2.1, 0.03, 1, 0.05);
    addTone(out, t * SR, r.range(80, 100), 0.03, 0.5, Math.PI / 2);
    for (let k = 0; k < 3; k++) bubble(out, t + r.range(0.015, 0.06), r.range(380, 900), r.range(0.15, 0.4), r, 0.5);
    addNoise(out, (t + 0.002) * SR, 0.004 * SR, 0.15, r);
  }
  return finish(out, { hp: 60, lp: 5000 });
}
function levelup(r) {
  const D = 3.2, out = out0(D), base = 523.25 * 1.5; // G5
  const bell = (t, f, a) => {
    const P = [[1, 1, 0.9], [2.0, 0.32, 0.5], [3.0, 0.12, 0.28], [4.2, 0.09, 0.18], [5.4, 0.04, 0.1]];
    for (const [k, pa, pt] of P) addTone(out, t * SR, f * k, pt, a * pa, 0);
  };
  const steps = [0, 4, 7, 12];
  steps.forEach((s, i) => bell(i * 0.065, base * Math.pow(2, s / 12), 0.55));
  for (const s of [0, 4, 7, 12]) bell(0.26, base * Math.pow(2, s / 12) * (1 + r.range(-0.002, 0.002)), 0.4);
  // soft attack on each ping: smooth the very first ms via gentle lowpass
  filt(out, 'lowpass', 9000, 0.7); fade(out, 0, 0.6);
  const wet = freeverb(out, { room: 0.6, damp: 0.5, wet: 0.25, dry: 1, tail: 0.6 });
  return finish(trimTail(wet), { hp: 200 });
}
function orb(r) {
  const D = 0.45, out = out0(D), f = r.range(1500, 1750);
  addTone(out, 0, f, 0.13, 1, 0); addTone(out, 0, f * 2.0, 0.06, 0.18, 0); addTone(out, 0, f * 2.76, 0.035, 0.12, 0);
  applyEnv(out, t => Math.min(1, t / 0.003));
  return out;
}
function toastIn(r) {
  const D = 0.6, out = Nz(D, r, t => Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.5)), 2) * (t < 0.5 ? 1 : 0));
  sweep(out, 'bandpass', t => 500 * Math.pow(7, Math.min(1, t / 0.45)), 1.6);
  return finish(normalize(out, 1), { hp: 200 });
}
function toastOut(r) { const b = toastIn(r); return b.reverse(); }
function challenge(r) {
  const D = 2.4, out = out0(D), base = 392;
  const notes = [[0, 0], [0.12, 4], [0.24, 7], [0.42, 12], [0.42, 16], [0.42, 19]];
  for (const [t, s] of notes) {
    const f = base * Math.pow(2, s / 12);
    for (const [k, a, tau] of [[1, 1, 0.7], [2, 0.4, 0.4], [3, 0.2, 0.25], [4, 0.1, 0.15]]) addTone(out, t * SR, f * k, tau, a * 0.4, 0);
  }
  filt(out, 'lowpass', 6000, 0.7);
  return trimTail(freeverb(out, { room: 0.7, wet: 0.3, tail: 0.8 }));
}

// ------------------------------------------------------------------ player damage / combat
function oof(r) {
  const D = 0.3, f = r.range(0.97, 1.03);
  const b = normalize(voice(r, {
    dur: D, f0: kf([0, 210 * f], [0.25, 192 * f], [0.8, 128 * f], [1, 112 * f]),
    amp: kf([0, 0], [0.05, 1], [0.45, 0.85], [0.75, 0.3], [1, 0]),
    F: [kf([0, 640], [0.3, 520], [1, 330]), kf([0, 1180], [0.3, 1000], [1, 780]), kf([0, 2450], [1, 2250]), 3300, 4200],
    BW: [90, 110, 170, 250, 300], jitter: 0.012, shimmer: 0.05, breath: 0.06,
  }), 1);
  mix(b, Nz(D, r, t => AD(t - 0.17, 0.03, 0.05), 'white', [['bandpass', 2800, 0.6]]), 0, 0.06);
  return finish(b, { lp: 5200, hp: 90 });
}
function fallThump(r, D, heavy) {
  const out = out0(D);
  let ph = 0; const dec = heavy ? 0.07 : 0.05;
  for (let i = 0; i < out.length; i++) { const t = i / SR; ph += TAU * (50 + 55 * Math.exp(-t / 0.03)) / SR; out[i] = Math.sin(ph) * AD(t, 0.003, dec); }
  mix(out, Nz(D, r, t => AD(t, 0.002, heavy ? 0.05 : 0.035), 'pink', [['lowpass', 900, 0.7]]), 0, 0.7);
  mix(out, Nz(D, r, t => AD(t, 0.001, 0.015), 'white', [['bandpass', 1500, 0.8]]), 0, 0.25);
  return out;
}
const fallSmall = r => finish(fallThump(r, 0.25, false), { hp: 40 });
function fallBig(r) {
  const D = 0.42, o2 = fallThump(r, D, true);
  const env = lumps([[0, 1, 0.002, 0.03], [r.range(0.03, 0.05), 0.6, 0.004, 0.04]]);
  mix(o2, G(D, r, env, { rate: 3000, fLo: 300, fHi: 4000, tauLo: 0.0004, tauHi: 0.003, pow: 1.8 }), 0, 0.8);
  return finish(o2, { hp: 40, lp: 7000 });
}
function whoosh(r, D, fA, fB, fC, q, peakT) {
  const b = Nz(D, r, t => { const u = t / D; return u < peakT ? Math.pow(u / peakT, 1.5) : Math.pow((1 - u) / (1 - peakT), 2); });
  sweep(b, 'bandpass', t => { const u = t / D; return u < peakT ? fA * Math.pow(fB / fA, u / peakT) : fB * Math.pow(fC / fB, (u - peakT) / (1 - peakT)); }, q);
  return normalize(b, 1);
}
const sweepAtk = r => finish(whoosh(r, 0.45, 300, 2600, 700, 1.8, 0.35), { hp: 150 });
function strongAtk(r) {
  const D = 0.32, out = out0(D);
  mix(out, whoosh(r, 0.16, 500, 1800, 900, 1.5, 0.6), 0, 0.5);
  const t0 = 0.08;
  let ph = 0; const th = out0(D);
  for (let i = 0; i < th.length; i++) { const t = i / SR - t0; if (t < 0) continue; ph += TAU * (90 + 80 * Math.exp(-t / 0.02)) / SR; th[i] = Math.sin(ph) * AD(t, 0.002, 0.045); }
  mix(out, th, 0, 0.8);
  mix(out, Nz(D, r, t => AD(t - t0, 0.001, 0.02), 'white', [['bandpass', 1800, 0.7]]), 0, 0.6);
  return finish(out, { hp: 50 });
}
function weakAtk(r) {
  const D = 0.2, out = out0(D);
  mix(out, whoosh(r, 0.12, 400, 1200, 700, 1.4, 0.5), 0, 0.5);
  mix(out, Nz(D, r, t => AD(t - 0.06, 0.003, 0.03), 'pink', [['lowpass', 1200, 0.7]]), 0, 0.6);
  return finish(out, { hp: 60 });
}
function critAtk(r) {
  const D = 0.35, out = strongAtk(r);
  const o = out0(D); mix(o, out, 0, 1);
  mix(o, G(D, r, t => AD(t - 0.08, 0.001, 0.025), { rate: 12000, fLo: 1500, fHi: 9000, tauLo: 0.0002, tauHi: 0.0012, pow: 1.5 }), 0, 0.7);
  return finish(o, { hp: 60 });
}
const knockAtk = r => { const D = 0.45, o = out0(D); mix(o, whoosh(r, 0.3, 250, 1500, 400, 1.6, 0.4), 0, 0.6); mix(o, strongAtk(r), 0.1 * SR, 0.7); return o; };
const noDmgAtk = r => finish(whoosh(r, 0.22, 600, 1600, 900, 2, 0.4), { hp: 200 });

// ------------------------------------------------------------------ doors, chests, bows, misc
// stick-slip creak: pulse train at time-varying rate exciting body resonances
function creak(D, r, t0, dur, rate, band, amp = 1) {
  const exc = alloc(D); let t = 0;
  while (t < dur) {
    const u = t / dur, rt = rate(u) * (1 + r.range(-0.08, 0.08));
    const a = amp * Math.sin(Math.PI * Math.min(1, u * 1.15)) * r.range(0.5, 1);
    const p = Math.floor((t0 + t) * SR); if (p < exc.length) exc[p] += a;
    t += 1 / rt;
  }
  const modes = [{ f: band, tau: 0.012, a: 1 }, { f: band * 1.73, tau: 0.008, a: 0.6 }, { f: band * 2.9, tau: 0.005, a: 0.35 }, { f: band * 0.45, tau: 0.015, a: 0.4 }];
  return normalize(modal(exc, modes), 1);
}
function doorOpen(r) {
  const D = 0.75, out = out0(D);
  const c0 = r.range(130, 170), c1 = r.range(200, 260);
  mix(out, creak(D, r, 0.05, r.range(0.35, 0.5), u => c0 + (c1 - c0) * Math.sin(Math.PI * u * 0.9), r.range(800, 1100)), 0, 0.7);
  addTone(out, 0, r.range(3200, 3800), 0.004, 0.3, 0); // latch tick
  mix(out, knock(D, r, [[0, 0.6], [0.6, 0.3]], barModes(r.range(140, 180), r, [0.06, 0.035, 0.02, 0.01]), 2), 0, 0.6);
  return finish(out, { hp: 80 });
}
function doorClose(r) {
  const D = 0.5, out = out0(D), f1 = r.range(110, 150);
  mix(out, knock(D, r, [[0, 1], [r.range(0.03, 0.05), 0.25]], barModes(f1, r, [0.065, 0.04, 0.024, 0.012], [1, 0.6, 0.35, 0.2]).concat([{ f: r.range(300, 380), a: 0.5, tau: 0.04 }]), 2.5), 0, 1);
  addTone(out, 0.004 * SR, r.range(3000, 3600), 0.006, 0.25, 0);
  addTone(out, 0.004 * SR, r.range(4500, 5200), 0.004, 0.15, 0);
  mix(out, Nz(D, r, t => AD(t, 0.001, 0.01), 'white', [['bandpass', 2000, 0.8]]), 0, 0.2);
  return finish(out, { hp: 55 });
}
function chestOpen(r) {
  const D = 0.9, out = out0(D);
  mix(out, creak(D, r, 0.06, r.range(0.5, 0.65), u => 70 + 80 * u + 30 * Math.sin(u * 7), r.range(550, 700)), 0, 0.7);
  mix(out, knock(D, r, [[0, 1]], barModes(r.range(120, 150), r, [0.06, 0.035, 0.02, 0.01]), 2), 0, 0.55);
  return finish(out, { hp: 60 });
}
function chestClose(r) {
  const D = 0.55, out = out0(D), f1 = r.range(85, 115);
  mix(out, knock(D, r, [[0, 1], [r.range(0.035, 0.06), 0.3]], barModes(f1, r, [0.1, 0.055, 0.03, 0.015], [1, 0.7, 0.4, 0.2]).concat([{ f: r.range(250, 330), a: 0.6, tau: 0.05 }]), 3), 0, 1);
  mix(out, Nz(D, r, t => AD(t, 0.002, 0.03), 'pink', [['lowpass', 900, 0.7]]), 0, 0.4);
  addTone(out, 0.01 * SR, r.range(2400, 2900), 0.006, 0.12, 0);
  return finish(out, { hp: 45 });
}
function bowShoot(r) {
  const D = 0.5, out = out0(D);
  const tw = pluck(N(D), r.range(95, 130), 0.993, 0.45, r);
  applyEnv(tw, t => AD(t, 0.001, 0.07)); mix(out, normalize(tw, 1), 0, 0.55);
  const wh = Nz(D, r, t => AD(t - 0.012, 0.03, 0.09));
  sweep(wh, 'bandpass', t => 450 + 2600 * Math.exp(-t / 0.1), 1.6); mix(out, normalize(wh, 1), 0, 0.8);
  addNoise(out, 0, 0.0015 * SR, 0.4, r);
  return finish(out, { hp: 70 });
}
function bowHit(r) {
  const D = 0.32, out = out0(D);
  mix(out, knock(D, r, [[0, 1]], barModes(r.range(260, 360), r, [0.05, 0.03, 0.016, 0.008], [1, 0.6, 0.35, 0.15], [1, 2.3, 4.1, 6.5]), 1.2), 0, 0.9);
  const wob = out0(D), f = r.range(450, 600), wr = r.range(28, 40);
  for (let i = 0; i < wob.length; i++) { const t = i / SR; wob[i] = Math.sin(TAU * f * t) * (0.5 + 0.5 * Math.sin(TAU * wr * t)) * AD(t, 0.003, 0.07); }
  mix(out, wob, 0, 0.25);
  mix(out, Nz(D, r, t => AD(t, 0.0008, 0.008), 'white', [['highpass', 1500, 0.7]]), 0, 0.3);
  return finish(out, { hp: 90 });
}
function fuse(r) {
  const D = 2.2, out = out0(D);
  const env = t => Math.min(1, t / 0.06) * (t > D - 0.3 ? (D - t) / 0.3 : 1);
  const fl = new Float32Array(N(D)); let y = 0; for (let i = 0; i < fl.length; i++) { y += (r.bi() - y) * 0.004; fl[i] = 0.65 + 0.35 * Math.tanh(y * 6); }
  const hiss = Nz(D, r, t => env(t) * fl[Math.min(fl.length - 1, Math.floor(t * SR))], 'white', [['highpass', 2600, 0.7], ['peaking', 5500, 0.8, 4]]);
  mix(out, hiss, 0, 0.8);
  mix(out, G(D, r, env, { rate: 350, fLo: 2000, fHi: 9000, tauLo: 0.0002, tauHi: 0.0012, pow: 1.3 }), 0, 0.6);
  return finish(out, { hp: 1500 });
}
function fizz(r) {
  const D = 0.9, out = out0(D);
  const env = t => AD(t, 0.006, 0.2) * 0.8 + 0.2 * AD(t, 0.05, 0.4);
  mix(out, Nz(D, r, env, 'white', [['highpass', 3000, 0.7], ['peaking', 6500, 0.9, 5]]), 0, 0.8);
  mix(out, G(D, r, t => AD(t, 0.002, 0.1), { rate: 2500, fLo: 2500, fHi: 11000, tauLo: 0.0001, tauHi: 0.0006, pow: 1.8 }), 0, 0.6);
  return finish(out, { hp: 1800 });
}
function explode(r) {
  const D = 3.2, n = N(D), out = out0(D);
  // initial blast: broadband noise whose lowpass closes quickly, plus a mid-band body that lingers
  const blast = Nz(D, r, t => AD(t, 0.003, 0.12) + 0.5 * AD(t, 0.01, 0.6));
  sweep(blast, 'lowpass', t => 500 + 8000 * Math.exp(-t / 0.09), 0.7); mix(out, normalize(blast, 1), 0, 0.85);
  // sub boom
  const boom = alloc(D); let ph = 0; const fb = r.range(32, 40);
  for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * (fb + 70 * Math.exp(-t / 0.09)) / SR; boom[i] = Math.sin(ph) * AD(t, 0.004, 0.35); }
  mix(out, boom, 0, 0.9);
  // rolling low rumble with random swells
  const rum = brown(n, r), lf = new Float32Array(n); let y = 0;
  for (let i = 0; i < n; i++) { y += (r.bi() - y) * 0.0006; lf[i] = y; }
  for (let i = 0; i < n; i++) { const t = i / SR; rum[i] *= AD(t, 0.02, 0.8) * (1 + 3 * lf[i]); }
  filt(rum, 'lowpass', 170, 0.7); filt(rum, 'lowpass', 220, 0.7); mix(out, normalize(rum, 1), 0, 0.8);
  // crunchy debris: dense crackle that thins out over ~1.5 s, plus a few bigger chunks landing
  const deb = t => AD(t, 0.01, 0.55);
  mix(out, G(D, r, deb, { rate: 1600, fLo: 400, fHi: 5000, tauLo: 0.0005, tauHi: 0.004, pow: 2.2, densPow: 1.5 }), 0, 0.55);
  const chunks = alloc(D);
  for (let k = r.int(5, 9); k > 0; k--) {
    const t = r.range(0.25, 1.6), m = [{ f: r.range(300, 700), a: 1, tau: 0.02 }, { f: r.range(900, 1800), a: 0.5, tau: 0.01 }];
    mix(chunks, knock(D, r, [[t, 1]], m, 2), 0, r.range(0.2, 0.6) * Math.exp(-t / 1.2));
  }
  mix(out, chunks, 0, 0.35);
  saturate(normalize(out, 1), 1.6);
  const wet = freeverb(out, { room: 0.65, damp: 0.6, wet: 0.18, tail: 0.6 });
  return finish(trimTail(wet, 0.002), { hp: 25 });
}
function ignite(r) {
  const D = 0.6, out = out0(D);
  const sf = flutter(N(D), r, 350, 0.05);
  const scr = Nz(D, r, t => AD(t, 0.008, 0.05) * sf[(t * SR) | 0], 'white', [['bandpass', 4200, 1.2]]);
  mix(out, scr, 0, 0.7);
  mix(out, G(D, r, t => AD(t - 0.015, 0.002, 0.04), { rate: 3500, fLo: 3000, fHi: 11000, tauLo: 0.0001, tauHi: 0.0005, pow: 1.6 }), 0, 0.6);
  const fl = Nz(D, r, t => { const u = (t - 0.06) / 0.45; return u < 0 ? 0 : Math.sin(Math.PI * Math.min(1, u)) * (1 - u * 0.5); });
  sweep(fl, 'lowpass', t => 300 + 1500 * Math.min(1, t / 0.3), 0.8); mix(out, normalize(fl, 1), 0, 0.45);
  return finish(out, { hp: 100 });
}
function fireCrackle(r) {
  const D = 2.6, n = N(D), out = out0(D);
  const env = t => Math.min(1, t / 0.25, (D - t) / 0.35);
  const roar = brown(n, r); let y = 0;
  for (let i = 0; i < n; i++) { y += (r.bi() - y) * 0.0015; roar[i] *= env(i / SR) * (0.6 + 1.6 * Math.abs(y)); }
  filt(roar, 'lowpass', 450, 0.7); mix(out, normalize(roar, 1), 0, 0.5);
  const cr = alloc(D);
  for (let t = r.range(0, 0.1); t < D - 0.05; t += r.exp(0.02, 0.25)) {
    const a = Math.pow(r.next(), 1.5) * env(t);
    addNoise(cr, t * SR, r.range(0.0006, 0.003) * SR, a, r, 0.05);
    if (r.chance(0.25)) for (let k = 0; k < r.int(2, 6); k++) addNoise(cr, (t + r.range(0.002, 0.02)) * SR, 0.0008 * SR, a * r.range(0.2, 0.6), r);
  }
  filt(cr, 'bandpass', 2200, 0.5); mix(out, normalize(cr, 1), 0, 0.9);
  return finish(out, { hp: 50 });
}
// ------------------------------------------------------------------ water / lava
function splash(r) {
  const D = 1.25, out = out0(D);
  const imp = Nz(D, r, t => AD(t, 0.004, 0.07) + 0.3 * AD(t, 0.02, 0.25));
  sweep(imp, 'lowpass', t => 1300 + 7000 * Math.exp(-t / 0.12), 0.7); mix(out, normalize(imp, 1), 0, 0.7);
  const bb = alloc(D);
  const nb = r.int(160, 220);
  for (let k = 0; k < nb; k++) { const t = Math.pow(r.next(), 2.2) * 0.75; bubble(bb, t, r.exp(350, 2600), r.range(0.15, 1) * Math.exp(-t / 0.35), r, r.range(0.3, 0.9)); }
  for (let k = 0; k < 18; k++) { const t = r.range(0.3, 1.05); bubble(bb, t, r.exp(1200, 4000), r.range(0.1, 0.4), r, 0.4); }
  mix(out, normalize(bb, 1), 0, 0.85);
  return finish(out, { hp: 90, lp: 10000 });
}
function swim(r) {
  const D = 0.6, out = out0(D);
  const sl = Nz(D, r, t => { const u = t / D; return Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.3)), 1.5); }, 'pink');
  sweep(sl, 'bandpass', t => 500 + 900 * Math.sin(Math.PI * Math.min(1, t / D)), 1.2); mix(out, normalize(sl, 1), 0, 0.7);
  const bb = alloc(D);
  for (let k = r.int(10, 22); k > 0; k--) { const t = r.range(0.03, D - 0.1); bubble(bb, t, r.exp(400, 1800), r.range(0.2, 1), r, r.range(0.3, 0.8)); }
  mix(out, normalize(bb, 1), 0, 0.5);
  return finish(out, { hp: 120, lp: 7000 });
}
function waterAmb(r) {
  const D = 2.8, out = out0(D), env = t => Math.min(1, t / 0.4, (D - t) / 0.5);
  const bb = alloc(D);
  for (let t = 0; t < D; t += r.exp(0.008, 0.07)) {
    const cl = r.chance(0.2) ? r.int(2, 5) : 1;
    for (let c = 0; c < cl; c++) { const tt = t + c * r.range(0.008, 0.03); bubble(bb, tt, r.exp(260, 1500), r.range(0.2, 1) * env(tt), r, r.range(0.4, 1.2)); }
  }
  mix(out, normalize(bb, 1), 0, 0.8);
  mix(out, Nz(D, r, env, 'pink', [['lowpass', 1400, 0.6], ['highpass', 200, 0.6]]), 0, 0.2);
  return finish(out, { hp: 120, lp: 6000 });
}
function lavaAmb(r) {
  const D = 2.6, n = N(D), out = out0(D), env = t => Math.min(1, t / 0.35, (D - t) / 0.5);
  const rum = brown(n, r); let y = 0;
  for (let i = 0; i < n; i++) { y += (r.bi() - y) * 0.0008; rum[i] *= env(i / SR) * (0.5 + 2 * Math.abs(y)); }
  filt(rum, 'lowpass', 260, 0.7); mix(out, normalize(rum, 1), 0, 0.7);
  const bb = alloc(D);
  for (let k = r.int(4, 8); k > 0; k--) { const t = r.range(0.1, D - 0.4); addChirp(bb, t * SR, r.range(70, 180), r.range(200, 350), r.range(0.04, 0.09), r.range(0.4, 1), 0.08); }
  mix(out, normalize(bb, 1), 0, 0.7);
  mix(out, G(D, r, env, { rate: 25, fLo: 800, fHi: 3500, tauLo: 0.0005, tauHi: 0.002, pow: 1.5 }), 0, 0.2);
  return finish(out, { hp: 30, lp: 3000 });
}
function lavaPop(r) {
  const D = 0.22, out = out0(D);
  addChirp(out, 0, r.range(180, 260), r.range(500, 700), 0.025, 1, 0.03);
  addTone(out, 0, r.range(70, 90), 0.025, 0.5, Math.PI / 2);
  mix(out, Nz(D, r, t => AD(t, 0.0005, 0.006), 'white', [['highpass', 2000, 0.7]]), 0, 0.35);
  return finish(out, { hp: 50 });
}
function paddleWater(r) {
  const D = 0.75, out = out0(D);
  const sw = Nz(D, r, t => AD(t, 0.06, 0.15), 'pink'); sweep(sw, 'bandpass', t => 600 + 1200 * Math.exp(-t / 0.2), 1.2);
  mix(out, normalize(sw, 1), 0, 0.6);
  const bb = alloc(D);
  for (let k = r.int(25, 45); k > 0; k--) { const t = 0.02 + Math.pow(r.next(), 1.6) * 0.5; bubble(bb, t, r.exp(400, 2000), r.range(0.2, 1) * Math.exp(-t / 0.3), r, r.range(0.4, 0.9)); }
  mix(out, normalize(bb, 1), 0, 0.6);
  return finish(out, { hp: 100, lp: 8000 });
}
function paddleLand(r) {
  const D = 0.55, out = out0(D);
  const sf = flutter(N(D), r, 120, 0.1);
  const sc = Nz(D, r, t => AD(t, 0.03, 0.15) * sf[(t * SR) | 0], 'white', [['bandpass', 900, 1], ['lowpass', 2500, 0.7]]);
  mix(out, sc, 0, 0.7);
  mix(out, knock(D, r, [[0, 0.8]], barModes(r.range(180, 240), r, [0.05, 0.03, 0.015, 0.008]), 1.5), 0, 0.6);
  mix(out, G(D, r, t => AD(t, 0.02, 0.12), { rate: 1200, fLo: 300, fHi: 3000, tauLo: 0.0005, tauHi: 0.003, pow: 2 }), 0, 0.4);
  return finish(out, { hp: 70 });
}
function underwaterEnter(r) {
  const D = 1.0, out = out0(D);
  const sw = Nz(D, r, t => AD(t, 0.03, 0.25), 'pink', [['lowpass', 700, 0.7]]); mix(out, sw, 0, 0.7);
  const bb = alloc(D);
  for (let k = 0; k < 40; k++) { const t = Math.pow(r.next(), 1.5) * 0.7; bubble(bb, t, r.exp(250, 1100), r.range(0.2, 1) * Math.exp(-t / 0.4), r, 0.7); }
  filt(bb, 'lowpass', 1500, 0.7); mix(out, normalize(bb, 1), 0, 0.6);
  return finish(out, { hp: 40 });
}

// ------------------------------------------------------------------ mobs
function pigSay(r) {
  const out = out0(0.7); let t = 0.0;
  const n = r.chance(0.5) ? 2 : 1, f = r.range(0.9, 1.15);
  for (let g = 0; g < n; g++) {
    const d = r.range(0.14, 0.24);
    const v = normalize(voice(r, {
      dur: d, f0: kf([0, 115 * f], [0.3, 170 * f], [1, 100 * f]), amp: kf([0, 0], [0.12, 1], [0.6, 0.8], [1, 0]),
      F: [kf([0, 300], [0.35, 540], [1, 330]), kf([0, 1050], [0.4, 1350], [1, 1000]), 2500, 3400],
      BW: [170, 200, 260, 320], jitter: 0.07, shimmer: 0.25, sub: 0.45, breath: 0.3, growl: 0.55, growlRate: 45, oq: 0.5,
    }), 1);
    const sn = Nz(d, r, u => Math.sin(Math.PI * Math.min(1, u / d)), 'white', [['bandpass', 750, 1.5]]);
    mix(out, v, t * SR, 1); mix(out, sn, t * SR, 0.3);
    t += d + r.range(0.05, 0.1);
  }
  return finish(trimTail(out), { lp: 4000, hp: 70 });
}
function pigDeath(r) {
  const D = 0.7, f = r.range(0.92, 1.08);
  const v = normalize(voice(r, {
    dur: D, f0: kf([0, 250 * f], [0.2, 430 * f], [0.55, 380 * f], [1, 190 * f]), amp: kf([0, 0], [0.07, 1], [0.6, 0.8], [1, 0]),
    F: [kf([0, 500], [0.25, 900], [1, 600]), kf([0, 1300], [0.25, 1900], [1, 1400]), 2800, 3800],
    BW: [140, 180, 250, 300], jitter: 0.05, shimmer: 0.2, sub: 0.25, breath: 0.25, growl: 0.35, growlRate: 50,
  }), 1);
  return finish(v, { lp: 5000, hp: 100 });
}
function cowSay(r) {
  const D = r.range(1.0, 1.4), f = r.range(0.9, 1.1), vr = r.range(4.5, 6);
  const f0c = kf([0, 92], [0.22, 128], [0.7, 116], [1, 88]);
  const v = normalize(voice(r, {
    dur: D, f0: u => f0c(u) * f * (1 + 0.015 * Math.sin(TAU * vr * u * D)), amp: kf([0, 0], [0.1, 0.75], [0.3, 1], [0.8, 0.85], [1, 0]),
    F: [kf([0, 260], [0.22, 500], [0.6, 560], [1, 380]), kf([0, 780], [0.25, 950], [0.7, 1000], [1, 820]), kf([0, 2300], [1, 2450]), 3300, 4000],
    BW: [kf([0, 260], [0.2, 110], [1, 150]), 130, 190, 260, 320], jitter: 0.03, shimmer: 0.12, sub: 0.15, breath: 0.12, growl: 0.25, growlRate: 34,
  }), 1);
  return finish(v, { lp: 3600, hp: 60 });
}
function cowHurt(r) {
  const D = r.range(0.5, 0.65), f = r.range(0.95, 1.08);
  const v = normalize(voice(r, {
    dur: D, f0: kf([0, 150 * f], [0.3, 178 * f], [1, 112 * f]), amp: kf([0, 0], [0.06, 1], [0.6, 0.8], [1, 0]),
    F: [kf([0, 450], [0.25, 720], [1, 500]), kf([0, 950], [0.3, 1150], [1, 900]), 2500, 3400], BW: [120, 140, 200, 280],
    jitter: 0.04, shimmer: 0.15, sub: 0.2, breath: 0.2, growl: 0.35,
  }), 1);
  return finish(v, { lp: 4000, hp: 70 });
}
function sheepSay(r) {
  const D = r.range(0.65, 0.9), f = r.range(0.92, 1.12), tr = r.range(8, 11);
  const trem = u => 1 - 0.55 * (0.5 + 0.5 * Math.cos(TAU * tr * u * D));
  const f0c = kf([0, 290], [0.15, 340], [1, 285]), ac = kf([0, 0], [0.06, 1], [0.75, 0.8], [1, 0]);
  const v = normalize(voice(r, {
    dur: D, f0: u => f0c(u) * f * (1 + 0.04 * Math.sin(TAU * tr * u * D)), amp: u => ac(u) * (u < 0.12 ? 1 : trem(u)),
    F: [kf([0, 350], [0.1, 820], [1, 700]), kf([0, 1400], [0.12, 1750], [1, 1650]), 2600, 3600, 4300], BW: [100, 120, 180, 250, 300],
    jitter: 0.02, shimmer: 0.1, breath: 0.15,
  }), 1);
  return finish(v, { lp: 6000, hp: 120 });
}
function cluck(r, d, f0a, f0b, F1, F2) {
  return normalize(voice(r, {
    dur: d, f0: kf([0, f0a], [0.3, f0a * 1.05], [1, f0b]), amp: kf([0, 0], [0.12, 1], [0.6, 0.6], [1, 0]),
    F: [F1, F2, 3000, 4000], BW: [150, 200, 300, 350], jitter: 0.05, shimmer: 0.15, breath: 0.3, oq: 0.5,
  }), 1);
}
function chickenSay(r) {
  const out = out0(0.9); let t = 0; const n = r.int(2, 4), f = r.range(0.92, 1.1);
  for (let k = 0; k < n; k++) {
    const last = k === n - 1 && r.chance(0.5), d = last ? r.range(0.16, 0.24) : r.range(0.05, 0.085);
    mix(out, last ? cluck(r, d, 560 * f, 470 * f, kf([0, 700], [0.3, 1100], [1, 900]), 1900) : cluck(r, d, 480 * f, 400 * f, 850, 1650), t * SR, last ? 0.8 : 1);
    t += d + r.range(0.06, 0.13);
  }
  return finish(trimTail(out), { hp: 250, lp: 7000 });
}
function chickenHurt(r) {
  const D = r.range(0.25, 0.32), f = r.range(0.95, 1.08);
  const v = normalize(voice(r, {
    dur: D, f0: kf([0, 700 * f], [0.3, 1000 * f], [1, 620 * f]), amp: kf([0, 0], [0.05, 1], [0.6, 0.7], [1, 0]),
    F: [1000, 2000, 3200, 4200], BW: [160, 220, 300, 350], jitter: 0.08, shimmer: 0.25, breath: 0.4, sub: 0.2,
  }), 1);
  return finish(v, { hp: 300, lp: 8000 });
}
function chickenPlop(r) {
  const D = 0.18, out = out0(D);
  addChirp(out, 0, r.range(240, 290), r.range(480, 560), 0.03, 1, 0.025);
  addTone(out, 0, 110, 0.02, 0.4, Math.PI / 2);
  addNoise(out, 0, 0.001 * SR, 0.2, r);
  return finish(out, { hp: 60 });
}
function zombieVoice(r, D, f0, amp, rough = 1) {
  return normalize(voice(r, {
    dur: D, f0, amp,
    F: [kf([0, 450], [0.35, 680], [1, 520]), kf([0, 850], [0.4, 1150], [1, 950]), kf([0, 2300], [0.5, 1700], [1, 2100]), 3100, 3900],
    BW: [150, 160, 220, 300, 350], jitter: 0.1 * rough, shimmer: 0.3 * rough, sub: 0.5, breath: 0.3, growl: 0.6 * rough, growlRate: 28, oq: 0.45,
  }), 1);
}
function zombieSay(r) {
  const D = r.range(1.0, 1.5), f = r.range(0.85, 1.1);
  const v = zombieVoice(r, D, kf([0, 76 * f], [0.3, 96 * f], [0.7, 86 * f], [1, 60 * f]), kf([0, 0], [0.2, 0.9], [0.5, 1], [0.85, 0.7], [1, 0]));
  saturate(v, 1.4);
  return finish(v, { lp: 3200, hp: 50 });
}
function zombieHurt(r) {
  const D = r.range(0.35, 0.45), f = r.range(0.92, 1.1);
  const v = zombieVoice(r, D, kf([0, 140 * f], [0.3, 125 * f], [1, 85 * f]), kf([0, 0], [0.05, 1], [0.5, 0.75], [1, 0]), 0.8);
  saturate(v, 1.5);
  return finish(v, { lp: 3500, hp: 60 });
}
function zombieDeath(r) {
  const D = r.range(1.4, 1.8);
  const v = zombieVoice(r, D, kf([0, 115], [0.2, 105], [1, 52]), kf([0, 0], [0.06, 1], [0.5, 0.7], [1, 0]), 1.1);
  saturate(v, 1.4);
  return finish(v, { lp: 3000, hp: 45 });
}
function zombieStep(r) {
  const D = 0.34, out = out0(D);
  mix(out, Nz(D, r, t => AD(t, 0.004, 0.05), 'brown', [['lowpass', 320, 0.7]]), 0, 0.9);
  mix(out, Nz(D, r, t => AD(t - 0.01, 0.02, 0.07), 'white', [['bandpass', 1300, 0.9]]), 0, 0.4);
  mix(out, G(D, r, lumps([[0, 1, 0.004, 0.04], [0.05, 0.5, 0.006, 0.05]]), { rate: 2000, fLo: 300, fHi: 3500, tauLo: 0.0005, tauHi: 0.003, pow: 2 }), 0, 0.5);
  addTone(out, 0, 75, 0.04, 0.4, Math.PI / 2);
  return finish(out, { hp: 35 });
}
function clack(b, r, pos, a) {
  const base = r.exp(900, 1700);
  addTone(b, pos, base, r.range(0.004, 0.01), a, r.next() * TAU);
  addTone(b, pos, base * r.range(2.1, 2.6), r.range(0.003, 0.007), a * 0.6, r.next() * TAU);
  addTone(b, pos, base * r.range(3.5, 4.6), r.range(0.0015, 0.004), a * 0.4, r.next() * TAU);
  addNoise(b, pos, 0.0008 * SR, a * 0.6, r, 0.05);
}
function rattle(r, D, groups, gapLo, gapHi, perLo, perHi, decay = 0) {
  const out = out0(D); let t = 0.005;
  for (let g = 0; g < groups && t < D - 0.05; g++) {
    const amp = (decay ? Math.exp(-t / decay) : 1) * r.range(0.6, 1), n = r.int(perLo, perHi);
    let tt = t; for (let k = 0; k < n; k++) { clack(out, r, tt * SR, amp * r.range(0.4, 1)); tt += r.range(0.012, 0.035); }
    t = tt + r.range(gapLo, gapHi);
  }
  return out;
}
function skeletonSay(r) {
  const out = rattle(r, 1.0, r.int(3, 5), 0.05, 0.13, 3, 7);
  addTone(out, 0.01 * SR, r.range(550, 700), 0.02, 0.2 * peak(out), 0);
  return finish(trimTail(out), { hp: 300 });
}
function skeletonHurt(r) {
  const out = rattle(r, 0.45, 2, 0.02, 0.05, 5, 9);
  mix(out, Nz(0.45, r, t => AD(t, 0.02, 0.1), 'white', [['bandpass', 3500, 1]]), 0, 0.25 * peak(out));
  return finish(trimTail(out), { hp: 300 });
}
function skeletonDeath(r) {
  const out = rattle(r, 1.4, 9, 0.02, 0.12, 3, 8, 0.6);
  return finish(trimTail(out), { hp: 250 });
}
function skeletonStep(r) {
  const out = rattle(r, 0.22, 1, 0.01, 0.02, 2, 3);
  mix(out, Nz(0.22, r, t => AD(t, 0.01, 0.04), 'white', [['bandpass', 1600, 0.8]]), 0, 0.3 * peak(out));
  return finish(trimTail(out), { hp: 200 });
}
function rasp(D, r, env, rate, band, q = 1.5) {
  const b = alloc(D); let ph = 0;
  for (let i = 0; i < b.length; i++) { ph += rate * (1 + 0.4 * r.bi()) / SR; if (ph >= 1) { ph -= 1; addNoise(b, i, 0.003 * SR, r.range(0.5, 1), r, 0.1); } }
  applyEnv(b, env); sweep(b, 'bandpass', band, q);
  return normalize(b, 1);
}
function creeperHurt(r) {
  const D = r.range(0.35, 0.45);
  const env = lumps([[0, 1, 0.008, 0.08], [r.range(0.07, 0.11), 0.5, 0.01, 0.08]]), out = out0(D);
  mix(out, G(D, r, env, { rate: 6500, fLo: 700, fHi: 6000, tauLo: 0.0002, tauHi: 0.0015, pow: 1.6 }), 0, 0.8);
  mix(out, rasp(D, r, env, r.range(65, 85), () => 1500, 1.4), 0, 0.6);
  return finish(out, { hp: 250, peaks: [[2500, 1, 3]] });
}
function creeperDeath(r) {
  const D = r.range(0.75, 0.9), out = out0(D);
  const env = lumps([[0, 1, 0.01, 0.15], [0.12, 0.6, 0.02, 0.2], [0.3, 0.4, 0.03, 0.2]]);
  mix(out, G(D, r, env, { rate: 6000, fLo: 600, fHi: 5000, tauLo: 0.0002, tauHi: 0.0015, pow: 1.6 }), 0, 0.7);
  mix(out, rasp(D, r, env, r.range(55, 70), t => 2400 * Math.exp(-t / 0.5) + 600, 1.4), 0, 0.7);
  return finish(out, { hp: 150 });
}
function spiderSay(r) {
  const D = r.range(0.5, 0.8), out = out0(D);
  const hump = t => Math.pow(Math.sin(Math.PI * Math.min(1, t / D)), 0.7);
  const ch = alloc(D); const rate = r.range(18, 30);
  for (let t = 0.01; t < D - 0.02; t += (1 / rate) * r.range(0.6, 1.5)) addNoise(ch, t * SR, r.range(0.006, 0.014) * SR, hump(t) * r.range(0.4, 1), r, 0.15);
  sweep(ch, 'bandpass', t => 3600 + 900 * Math.sin(t * 9), 1.4); mix(out, normalize(ch, 1), 0, 0.8);
  mix(out, Nz(D, r, t => hump(t) * 0.6, 'white', [['bandpass', 6000, 0.8]]), 0, 0.35);
  mix(out, rasp(D, r, t => hump(t), r.range(90, 130), () => 2200, 2), 0, 0.3);
  return finish(out, { hp: 900 });
}
function spiderDeath(r) {
  const D = r.range(0.9, 1.1), out = out0(D);
  const env = t => AD(t, 0.03, 0.4);
  const ch = alloc(D);
  for (let t = 0.01; t < D - 0.02; t += (1 / (35 - 25 * t / D)) * r.range(0.7, 1.3)) addNoise(ch, t * SR, 0.012 * SR, env(t) * r.range(0.4, 1), r, 0.15);
  sweep(ch, 'bandpass', t => 4200 * Math.exp(-t / 0.5) + 1100, 1.6); mix(out, normalize(ch, 1), 0, 0.8);
  mix(out, rasp(D, r, env, r.range(140, 180), t => 3000 * Math.exp(-t / 0.4) + 700, 2), 0, 0.6);
  return finish(out, { hp: 400 });
}
function spiderStep(r) {
  const D = 0.2, out = out0(D);
  for (let k = 0, t = 0.002; k < r.int(2, 3); k++, t += r.range(0.03, 0.06)) addNoise(out, t * SR, r.range(0.002, 0.005) * SR, r.range(0.6, 1), r, 0.1);
  filt(out, 'bandpass', r.range(2800, 4200), 1.2);
  return finish(normalize(out, 1), { hp: 1000 });
}

// ------------------------------------------------------------------ loops & ambience
function minecart(r, inside) {
  const L = 2.0, X = 0.25, D = L + X, n = N(D), out = out0(D);
  const rum = brown(n, r); filt(rum, 'lowpass', inside ? 220 : 300, 0.7); mix(out, normalize(rum, 1), 0, inside ? 1 : 0.7);
  const wr = 12; // wheel rotation modulation
  const roll = Nz(D, r, t => 0.75 + 0.25 * Math.sin(TAU * wr * t), 'white', [['bandpass', inside ? 600 : 900, 0.7]]);
  mix(out, roll, 0, inside ? 0.25 : 0.45);
  if (!inside) {
    const sq = out0(D), fs = [r.range(1150, 1250), r.range(1680, 1780), r.range(2550, 2650)];
    for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (let k = 0; k < 3; k++) s += Math.sin(TAU * fs[k] * t + k) * (0.5 + 0.5 * Math.sin(TAU * (0.5 + k * 0.5) * t + k * 2)); sq[i] = s; }
    mix(out, normalize(sq, 1), 0, 0.06);
  }
  const clacks = [0.12, 0.62, 1.12, 1.62, 2.12].filter(t => t < D - 0.05);
  const kn = knock(D, r, clacks.map(t => [t, 1]), [{ f: inside ? 140 : 180, a: 1, tau: 0.03 }, { f: inside ? 420 : 520, a: 0.6, tau: 0.02 }, { f: 1400, a: inside ? 0.1 : 0.3, tau: 0.008 }], 2);
  mix(out, kn, 0, inside ? 0.4 : 0.3);
  if (inside) filt(out, 'lowpass', 1500, 0.7);
  return loopify(finish(out, { hp: 30 }), X);
}
function rainLoop(r) {
  const L = 6, X = 0.5, D = L + X;
  return [0, 1].map(() => {
    const out = out0(D);
    mix(out, Nz(D, r, () => 1, 'pink', [['highpass', 400, 0.6], ['lowpass', 7000, 0.6]]), 0, 0.35);
    mix(out, G(D, r, () => 1, { rate: 2600, fLo: 1500, fHi: 11000, tauLo: 0.0001, tauHi: 0.0006, pow: 3 }), 0, 0.6);
    mix(out, G(D, r, () => 1, { rate: 70, fLo: 500, fHi: 2500, tauLo: 0.001, tauHi: 0.005, pow: 1.5 }), 0, 0.35);
    return loopify(finish(out, { hp: 150, peaks: [[3500, 0.6, 2]] }), X);
  });
}
function underwaterLoop(r) {
  const L = 7, X = 0.6, D = L + X, n = N(D);
  return [0, 1].map(() => {
    const out = out0(D), rum = brown(n, r); let y = 0;
    for (let i = 0; i < n; i++) { y += (r.bi() - y) * 0.0003; rum[i] *= 0.6 + 2 * Math.abs(y); }
    filt(rum, 'lowpass', 260, 0.7); filt(rum, 'lowpass', 400, 0.7); mix(out, normalize(rum, 1), 0, 1);
    const bb = alloc(D);
    for (let t = r.range(0, 0.5); t < D; t += r.exp(0.15, 1.2)) bubble(bb, t, r.exp(150, 650), r.range(0.3, 1), r, r.range(0.4, 1));
    filt(bb, 'lowpass', 900, 0.7); mix(out, normalize(bb, 1), 0, 0.25);
    return loopify(finish(out, { hp: 25 }), X);
  });
}
function thunderNear(r) {
  const D = 7.5, n = N(D), out = out0(D);
  const crackEnv = t => { const u = t / 0.28; return u < 0 || u > 1 ? 0 : AD(t, 0.002, 0.05) + 0.6 * (r.next() < 0.08 ? 1 : 0.3) * (1 - u); };
  mix(out, G(D, r, crackEnv, { rate: 30000, fLo: 300, fHi: 9000, tauLo: 0.0003, tauHi: 0.002, pow: 1.4 }), 0, 0.9);
  mix(out, Nz(D, r, t => AD(t, 0.002, 0.08), 'white', [['highpass', 600, 0.7]]), 0, 0.6);
  mix(out, rumble(r, D, 0.08, 1.0), 0, 1);
  saturate(normalize(out, 1), 1.3);
  return finish(trimTail(freeverb(out, { room: 0.85, damp: 0.6, wet: 0.2, tail: 1.5 })), { hp: 20 });
}
function rumble(r, D, start, bright) {
  const n = N(D), rum = brown(n, r), env = new Float32Array(n);
  const rolls = r.int(4, 7); let t = start;
  const L = [];
  for (let k = 0; k < rolls; k++) { L.push([t, r.range(0.4, 1) * Math.exp(-k * 0.25), r.range(0.05, 0.3), r.range(0.4, 1.2)]); t += r.range(0.25, 1.1); }
  const e = lumps(L); let y = 0;
  for (let i = 0; i < n; i++) { y += (r.bi() - y) * 0.002; env[i] = e(i / SR) * (0.7 + 0.6 * Math.abs(y) * 3); rum[i] *= env[i]; }
  filt(rum, 'lowpass', 120 + 250 * bright, 0.7); filt(rum, 'lowpass', 200 + 300 * bright, 0.7);
  const mid = white(n, r); for (let i = 0; i < n; i++) mid[i] *= env[i];
  filt(mid, 'lowpass', 500 + 900 * bright, 0.6); filt(mid, 'lowpass', 700 + 900 * bright, 0.6);
  const out = normalize(rum, 1); mix(out, normalize(mid, 1), 0, 0.25 * bright + 0.1);
  return normalize(out, 1);
}
function thunderFar(r) {
  const D = 7, out = rumble(r, D, 0.2, 0.25);
  return finish(trimTail(freeverb(out, { room: 0.85, damp: 0.7, wet: 0.25, tail: 1.5 })), { hp: 20 });
}
// cave ambience: several eerie flavours with long baked reverb
function caveAmb(r, v) {
  const kind = v % 5, D = 6, n = N(D), out = out0(D);
  if (kind === 0) { // low drone swell + wind
    const f = r.range(48, 62);
    for (let i = 0; i < n; i++) { const t = i / SR, e = Math.pow(Math.sin(Math.PI * Math.min(1, t / 5)), 2); out[i] = e * (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 1.498 * t + 1) + 0.4 * Math.sin(TAU * f * 2.01 * t) * Math.sin(TAU * 0.7 * t)); }
    normalize(out, 1);
    mix(out, Nz(D, r, t => Math.pow(Math.sin(Math.PI * Math.min(1, t / 5)), 2), 'pink', [['bandpass', 400, 2]]), 0, 0.35);
  } else if (kind === 1) { // reversed reverberant hit
    const hit = out0(2.5);
    mix(hit, knock(2.5, r, [[0, 1]], [{ f: r.range(180, 260), a: 1, tau: 0.3 }, { f: r.range(420, 560), a: 0.6, tau: 0.2 }, { f: r.range(900, 1300), a: 0.3, tau: 0.1 }], 3), 0, 1);
    mix(hit, Nz(2.5, r, t => AD(t, 0.002, 0.15), 'pink', [['lowpass', 2000, 0.7]]), 0, 0.5);
    const rev = reverse(freeverb(hit, { room: 0.92, damp: 0.5, wet: 0.9, dry: 0.3, tail: 2.5 }));
    mix(out, normalize(rev, 1), 0.3 * SR, 1);
  } else if (kind === 2) { // distant groan
    const g = out0(D); let ph = 0; const f0 = r.range(150, 200);
    for (let i = 0; i < n; i++) {
      const t = i / SR, u = t / 4.5, f = f0 * (1 - 0.35 * Math.min(1, u)) * (1 + 0.01 * Math.sin(TAU * 4.5 * t));
      ph += f / SR; const saw = 2 * (ph - Math.floor(ph)) - 1; g[i] = saw * Math.pow(Math.sin(Math.PI * Math.min(1, u)), 1.5);
    }
    sweep(g, 'bandpass', t => 500 + 300 * Math.sin(t * 1.3), 3); mix(out, normalize(g, 1), 0, 1);
  } else if (kind === 3) { // distant tumbling stones / drips
    for (let k = r.int(4, 7), t = r.range(0.1, 0.4); k > 0; k--, t += r.range(0.15, 0.9)) {
      const m = [{ f: r.range(500, 900), a: 1, tau: 0.03 }, { f: r.range(1300, 2200), a: 0.5, tau: 0.015 }, { f: r.range(200, 300), a: 0.5, tau: 0.04 }];
      mix(out, knock(D, r, [[t, 1]], m, 1), 0, r.range(0.3, 1) * Math.exp(-k * 0.05));
    }
    mix(out, Nz(D, r, t => 0.5 + 0.5 * Math.sin(t * 0.9), 'pink', [['bandpass', 250, 1.5]]), 0, 0.15);
  } else { // eerie whistle
    let ph = 0; const f0 = r.range(500, 800);
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = f0 * (1 + 0.15 * Math.sin(TAU * 0.18 * t) - 0.1 * t / D);
      ph += TAU * f / SR; out[i] = Math.sin(ph) * Math.pow(Math.sin(Math.PI * Math.min(1, t / 4.5)), 2) * (0.85 + 0.15 * Math.sin(TAU * 5 * t));
    }
    normalize(out, 0.6);
    mix(out, Nz(D, r, t => Math.pow(Math.sin(Math.PI * Math.min(1, t / 5)), 2), 'white', [['bandpass', 900, 4]]), 0, 0.4);
  }
  normalize(out, 1);
  const wet = freeverb(out, { room: 0.93, damp: 0.45, wet: 0.45, dry: 0.6, tail: 2.5 });
  return finish(trimTail(wet), { hp: 30 });
}

// ------------------------------------------------------------------ registry
// def: { gen, n: variants, cat, gain, pv: pitch variance (+/- fraction, triangular), loop, stereo, heavy, len:[min,max] }
export const SOUNDS = {};
function def(name, n, cat, gain, pv, gen, extra = {}) { SOUNDS[name] = { name, n, cat, gain, pv, gen, ...extra }; }
const B = 'blocks';
def('dig.stone', 4, B, 0.9, 0.06, digStone, { len: [0.2, 0.45] });
def('dig.wood', 4, B, 0.9, 0.06, digWood, { len: [0.2, 0.5] });
def('dig.gravel', 4, B, 0.9, 0.06, digGravel, { len: [0.3, 0.55] });
def('dig.grass', 4, B, 0.9, 0.06, digGrass, { len: [0.3, 0.5] });
def('dig.sand', 4, B, 0.85, 0.06, digSand, { len: [0.3, 0.5] });
def('dig.snow', 4, B, 0.85, 0.06, digSnow, { len: [0.3, 0.5] });
def('dig.cloth', 4, B, 0.95, 0.06, digCloth, { len: [0.2, 0.4] });
def('dig.glass', 3, B, 0.85, 0.06, digGlass, { len: [0.8, 1.2] });
def('dig.metal', 3, B, 0.75, 0.05, digMetal, { len: [0.3, 0.55] });
def('step.stone', 6, B, 0.32, 0.05, stepStone, { len: [0.1, 0.25] });
def('step.wood', 6, B, 0.32, 0.05, stepWood, { len: [0.1, 0.25] });
def('step.gravel', 4, B, 0.3, 0.05, stepGravel, { len: [0.15, 0.32] });
def('step.grass', 6, B, 0.3, 0.05, stepGrass, { len: [0.15, 0.3] });
def('step.sand', 5, B, 0.3, 0.05, stepSand, { len: [0.15, 0.3] });
def('step.snow', 4, B, 0.3, 0.05, stepSnow, { len: [0.15, 0.3] });
def('step.cloth', 4, B, 0.32, 0.05, stepCloth, { len: [0.1, 0.25] });
def('step.metal', 4, B, 0.28, 0.05, stepMetal, { len: [0.15, 0.35] });
def('step.ladder', 5, B, 0.3, 0.05, stepLadder, { len: [0.1, 0.25] });
def('random.pop', 1, 'player', 0.35, 0.35, pop, { len: [0.08, 0.15] });
def('random.click', 1, 'ui', 0.45, 0, click, { len: [0.04, 0.1] });
def('random.break', 2, 'player', 0.7, 0.08, toolBreak, { len: [0.2, 0.5] });
def('random.eat', 3, 'player', 0.55, 0.12, eat, { len: [0.15, 0.32] });
def('random.burp', 2, 'player', 0.55, 0.08, burp, { len: [0.4, 0.65] });
def('random.drink', 2, 'player', 0.55, 0.08, drink, { len: [0.3, 0.65] });
def('random.explode', 4, B, 1.0, 0.1, explode, { len: [2, 4] });
def('random.fuse', 1, B, 0.6, 0.03, fuse, { len: [1.8, 2.4] });
def('random.splash', 2, 'neutral', 0.7, 0.1, splash, { len: [0.9, 1.3] });
def('random.swim', 4, 'player', 0.4, 0.1, swim, { len: [0.4, 0.65] });
def('random.levelup', 1, 'player', 0.55, 0, levelup, { len: [1.5, 3.9] });
def('random.orb', 2, 'player', 0.3, 0.25, orb, { len: [0.2, 0.5] });
def('random.door_open', 2, B, 0.7, 0.06, doorOpen, { len: [0.4, 0.8] });
def('random.door_close', 2, B, 0.7, 0.06, doorClose, { len: [0.3, 0.55] });
def('random.bow', 2, 'player', 0.55, 0.12, bowShoot, { len: [0.3, 0.55] });
def('random.bowhit', 4, 'neutral', 0.55, 0.1, bowHit, { len: [0.15, 0.35] });
def('random.fizz', 1, B, 0.5, 0.12, fizz, { len: [0.5, 1.0] });
def('random.chestopen', 1, B, 0.6, 0.05, chestOpen, { len: [0.5, 1.0] });
def('random.chestclosed', 1, B, 0.6, 0.05, chestClose, { len: [0.3, 0.6] });
def('fire.ignite', 1, B, 0.6, 0.1, ignite, { len: [0.3, 0.65] });
def('fire.fire', 2, B, 0.5, 0.15, fireCrackle, { len: [2, 2.8] });
def('liquid.water', 3, B, 0.4, 0.15, waterAmb, { len: [2, 3] });
def('liquid.lava', 2, B, 0.55, 0.1, lavaAmb, { len: [2, 3] });
def('liquid.lavapop', 2, B, 0.5, 0.15, lavaPop, { len: [0.1, 0.25] });
def('damage.hit', 3, 'player', 0.8, 0.08, oof, { len: [0.2, 0.35] });
def('damage.fallsmall', 1, 'player', 0.6, 0.05, fallSmall, { len: [0.15, 0.3] });
def('damage.fallbig', 2, 'player', 0.7, 0.05, fallBig, { len: [0.25, 0.45] });
def('player.attack.sweep', 3, 'player', 0.5, 0.08, sweepAtk, { len: [0.3, 0.5] });
def('player.attack.strong', 3, 'player', 0.6, 0.08, strongAtk, { len: [0.2, 0.35] });
def('player.attack.weak', 3, 'player', 0.5, 0.08, weakAtk, { len: [0.1, 0.25] });
def('player.attack.crit', 3, 'player', 0.6, 0.08, critAtk, { len: [0.2, 0.4] });
def('player.attack.knockback', 3, 'player', 0.6, 0.08, knockAtk, { len: [0.3, 0.5] });
def('player.attack.nodamage', 3, 'player', 0.45, 0.08, noDmgAtk, { len: [0.15, 0.3] });
const H = 'hostile', Nu = 'neutral';
def('mob.pig.say', 3, Nu, 0.6, 0.15, pigSay, { len: [0.12, 0.7] });
def('mob.pig.death', 1, Nu, 0.65, 0.12, pigDeath, { len: [0.5, 0.75] });
def('mob.cow.say', 4, Nu, 0.6, 0.12, cowSay, { len: [0.9, 1.5] });
def('mob.cow.hurt', 3, Nu, 0.6, 0.12, cowHurt, { len: [0.4, 0.7] });
def('mob.sheep.say', 3, Nu, 0.55, 0.12, sheepSay, { len: [0.6, 1.0] });
def('mob.chicken.say', 3, Nu, 0.5, 0.15, chickenSay, { len: [0.1, 0.9] });
def('mob.chicken.hurt', 2, Nu, 0.5, 0.12, chickenHurt, { len: [0.2, 0.35] });
def('mob.chicken.plop', 1, Nu, 0.5, 0.2, chickenPlop, { len: [0.1, 0.2] });
def('mob.zombie.say', 3, H, 0.65, 0.12, zombieSay, { len: [0.9, 1.6] });
def('mob.zombie.hurt', 2, H, 0.65, 0.12, zombieHurt, { len: [0.3, 0.5] });
def('mob.zombie.death', 1, H, 0.65, 0.1, zombieDeath, { len: [1.3, 1.9] });
def('mob.zombie.step', 5, H, 0.35, 0.06, zombieStep, { len: [0.2, 0.36] });
def('mob.skeleton.say', 3, H, 0.55, 0.12, skeletonSay, { len: [0.2, 1.0] });
def('mob.skeleton.hurt', 4, H, 0.55, 0.12, skeletonHurt, { len: [0.15, 0.45] });
def('mob.skeleton.death', 1, H, 0.6, 0.1, skeletonDeath, { len: [0.6, 1.4] });
def('mob.skeleton.step', 4, H, 0.35, 0.06, skeletonStep, { len: [0.05, 0.22] });
def('mob.creeper.say', 4, H, 0.6, 0.12, creeperHurt, { len: [0.3, 0.46] });
def('mob.creeper.death', 1, H, 0.6, 0.1, creeperDeath, { len: [0.7, 0.92] });
def('mob.spider.say', 4, H, 0.5, 0.12, spiderSay, { len: [0.45, 0.82] });
def('mob.spider.death', 1, H, 0.55, 0.1, spiderDeath, { len: [0.85, 1.12] });
def('mob.spider.step', 4, H, 0.3, 0.08, spiderStep, { len: [0.05, 0.2] });
def('minecart.base', 1, Nu, 0.45, 0, r => minecart(r, false), { loop: true, len: [1.9, 2.1] });
def('minecart.inside', 1, Nu, 0.5, 0, r => minecart(r, true), { loop: true, len: [1.9, 2.1] });
def('boat.paddle_water', 3, Nu, 0.5, 0.1, paddleWater, { len: [0.5, 0.8] });
def('boat.paddle_land', 3, Nu, 0.5, 0.1, paddleLand, { len: [0.4, 0.6] });
def('ambient.cave', 5, 'ambient', 0.7, 0.1, caveAmb, { len: [4, 10], heavy: true });
def('ambient.weather.thunder', 3, 'weather', 1.0, 0.1, thunderNear, { len: [5, 10], heavy: true });
def('ambient.weather.thunder.far', 3, 'weather', 0.9, 0.1, thunderFar, { len: [5, 10], heavy: true });
def('ambient.weather.rain', 1, 'weather', 0.5, 0, rainLoop, { loop: true, stereo: true, len: [5.9, 6.1], heavy: true });
def('ambient.underwater.loop', 1, 'ambient', 0.6, 0, underwaterLoop, { loop: true, stereo: true, len: [6.9, 7.1], heavy: true });
def('ambient.underwater.enter', 2, 'ambient', 0.5, 0.08, underwaterEnter, { len: [0.6, 1.1] });
def('ui.toast', 1, 'ui', 0.35, 0, toastIn, { len: [0.4, 0.65] });
def('ui.toast.out', 1, 'ui', 0.35, 0, toastOut, { len: [0.4, 0.65] });
def('ui.toast.challenge_complete', 1, 'ui', 0.45, 0, challenge, { len: [1.5, 3.5] });

// Aliases: name -> [source, rateMul, gainMul, catOverride?]
export const ALIASES = {};
const MATS = ['stone', 'wood', 'gravel', 'grass', 'sand', 'snow', 'cloth', 'glass', 'metal'];
for (const m of MATS) {
  ALIASES['place.' + m] = [m === 'glass' ? 'dig.stone' : 'dig.' + m, 1, 1];   // vanilla glass places with stone sounds
  const stepSrc = m === 'glass' ? 'step.stone' : 'step.' + m;
  ALIASES['hit.' + m] = [stepSrc, 0.5, 1.0];                                   // vanilla: step sound at 0.5 pitch
}
ALIASES['hit.ladder'] = ['step.ladder', 0.5, 1.0];
ALIASES['step.glass'] = ['step.stone', 1, 1];
Object.assign(ALIASES, {
  'random.glass': ['dig.glass', 1, 1], 'random.chestclose': ['random.chestclosed', 1, 1],
  'random.hurt': ['damage.hit', 1, 1], 'damage.hurt': ['damage.hit', 1, 1], 'player.hurt': ['damage.hit', 1, 1],
  'entity.boat.splash': ['random.splash', 1.1, 0.7], 'ui.toast.in': ['ui.toast', 1, 1], 'ui.button.click': ['random.click', 1, 1],
  'dig.dirt': ['dig.gravel', 1, 1], 'step.dirt': ['step.gravel', 1, 1], 'dig.wool': ['dig.cloth', 1, 1], 'step.wool': ['step.cloth', 1, 1],
  'dig.leaves': ['dig.grass', 1, 1], 'step.leaves': ['step.grass', 1, 1], 'mob.creeper.hurt': ['mob.creeper.say', 1, 1],
  'mob.pig.hurt': ['mob.pig.say', 1.15, 1], 'mob.sheep.hurt': ['mob.sheep.say', 1.2, 1], 'mob.cow.death': ['mob.cow.hurt', 0.85, 1],
  'mob.sheep.death': ['mob.sheep.say', 0.9, 1], 'mob.chicken.death': ['mob.chicken.hurt', 0.9, 1],
  'mob.spider.hurt': ['mob.spider.say', 1.1, 1],
});
// hit.* get the vanilla relative level (hit volume 0.25 vs step 0.15 => slightly louder than steps)
for (const k in ALIASES) if (k.startsWith('hit.')) ALIASES[k][2] = 1.1;

export const SOUND_NAMES = Object.keys(SOUNDS);
export function resolve(name) {
  if (SOUNDS[name]) return { src: name, rate: 1, gain: 1 };
  const a = ALIASES[name]; if (a && SOUNDS[a[0]]) return { src: a[0], rate: a[1], gain: a[2] };
  return null;
}
export function seedFor(name, v) { return (hashStr(name) ^ Math.imul(v + 1, 0x9E3779B1)) >>> 0; }
// Render one variant; returns { sr, chans:[Float32Array...] }
export function renderSound(name, v = 0) {
  const d = SOUNDS[name]; if (!d) throw new Error('unknown sound ' + name);
  let out = d.gen(new Rng(seedFor(name, v)), v);
  let chans = Array.isArray(out) ? out : [out];
  chans = chans.map(c => {
    for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) c[i] = 0;
    if (!d.loop) fade(c, 0.0008, 0.006);
    return c;
  });
  const p = Math.max(...chans.map(peak)); if (p > 0) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= 0.9 / p;
  return { sr: SR, chans };
}
