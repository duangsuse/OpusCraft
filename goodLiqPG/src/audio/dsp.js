// Pure-JS DSP primitives operating on Float32Array. No Web Audio dependency: runs in browser main thread,
// in a Web Worker and in Node (used by tools/test_audio.mjs to render WAVs).
export const SR = 44100;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- random
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export class Rng {
  constructor(seed = 1) { this.f = mulberry32((seed >>> 0) || 1); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  exp(a, b) { return a * Math.pow(b / a, this.f()); }          // log-uniform in [a,b]
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }  // inclusive
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  bi() { return this.f() * 2 - 1; }
  tri() { return this.f() - this.f(); }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  gauss() { const u = 1 - this.f(), v = this.f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  weighted(obj) { // {key: weight}
    let tot = 0; for (const k in obj) tot += obj[k];
    let x = this.f() * tot; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; }
    return Object.keys(obj)[0];
  }
}

// ---------------------------------------------------------------- buffers
export const alloc = (sec, sr = SR) => new Float32Array(Math.max(1, Math.ceil(sec * sr)));
export function white(n, r) { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = r.bi(); return b; }
export function pink(n, r) { // Paul Kellet's refined method
  const b = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r.bi();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    b[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return b;
}
export function brown(n, r) {
  const b = new Float32Array(n); let y = 0;
  for (let i = 0; i < n; i++) { y = (y + 0.02 * r.bi()) / 1.02; b[i] = y * 3.5; }
  return b;
}
export function peak(b) { let m = 0; for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > m) m = a; } return m; }
export function rms(b, from = 0, to = b.length) { let s = 0; for (let i = from; i < to; i++) s += b[i] * b[i]; return Math.sqrt(s / Math.max(1, to - from)); }
export function scale(b, g) { for (let i = 0; i < b.length; i++) b[i] *= g; return b; }
export function normalize(b, p = 0.9) { const m = peak(b); if (m > 1e-9) scale(b, p / m); return b; }
export function normRms(b, target = 0.1) { const m = rms(b); if (m > 1e-12) scale(b, target / m); return b; }
export function mix(dst, src, offset = 0, gain = 1) {
  const o = Math.round(offset), n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
  return dst;
}
export function fade(b, inSec = 0.002, outSec = 0.01, sr = SR) {
  const ni = Math.min(b.length, Math.round(inSec * sr)), no = Math.min(b.length, Math.round(outSec * sr));
  for (let i = 0; i < ni; i++) b[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
  for (let i = 0; i < no; i++) b[b.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
  return b;
}
export function reverse(b) { return b.slice().reverse(); }
export function saturate(b, drive = 1) { const k = Math.tanh(drive); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / k; return b; }
export function applyEnv(b, env, sr = SR) { for (let i = 0; i < b.length; i++) b[i] *= env(i / sr); return b; }
// trim trailing near-silence (keeps a short fade so the cut is clean)
export function trimTail(b, thresh = 1e-4, sr = SR) {
  let e = b.length - 1; while (e > 0 && Math.abs(b[e]) < thresh) e--;
  const n = Math.min(b.length, e + Math.round(0.005 * sr));
  const out = b.slice(0, Math.max(1, n)); fade(out, 0, 0.004, sr); return out;
}
// Make a seamlessly looping buffer: input must be longer than wanted length by xfade samples.
export function loopify(b, xfadeSec = 0.25, sr = SR) {
  const X = Math.round(xfadeSec * sr), L = b.length - X, out = b.slice(0, L);
  for (let i = 0; i < X; i++) {
    const t = i / X, gi = Math.sin(t * Math.PI / 2), go = Math.cos(t * Math.PI / 2);
    out[i] = b[i] * gi + b[L + i] * go;
  }
  return out;
}

// ---------------------------------------------------------------- envelopes (time in seconds)
export const AD = (t, a, d) => t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d);
export const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
// keyframe function over normalised time: kf([t0,v0],[t1,v1],...) with smoothstep interpolation
export function kf(...pts) {
  return t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * smooth((t - a) / (b - a || 1)); }
    }
    return pts[pts.length - 1][1];
  };
}

// ---------------------------------------------------------------- filters
export class Biquad {
  constructor(type = 'lowpass', f = 1000, q = 0.7071, gainDb = 0, sr = SR) {
    this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.type = type; this.q = q; this.g = gainDb;
    this.set(f, q, gainDb, type);
  }
  set(f, q = this.q, gainDb = this.g, type = this.type) {
    this.type = type; this.q = q; this.g = gainDb;
    f = Math.min(Math.max(f, 5), this.sr * 0.49);
    const w = TAU * f / this.sr, cs = Math.cos(w), sn = Math.sin(w);
    const alpha = sn / (2 * Math.max(q, 1e-4)), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'allpass': b0 = 1 - alpha; b1 = -2 * cs; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha; break;
      case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s);
        a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
        a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; break;
      }
      default: throw new Error('bad filter ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
  run(b, from = 0, to = b.length) {
    const { b0, b1, b2, a1, a2 } = this; let { x1, x2, y1, y2 } = this;
    for (let i = from; i < to; i++) {
      const x = b[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
    }
    if (Math.abs(y1) < 1e-25) y1 = 0; if (Math.abs(y2) < 1e-25) y2 = 0;
    Object.assign(this, { x1, x2, y1, y2 }); return b;
  }
}
// static filter in place
export function filt(b, type, f, q = 0.7071, gainDb = 0, sr = SR) { return new Biquad(type, f, q, gainDb, sr).run(b); }
// time-varying filter: fFn(tSec) -> Hz (qFn optional number or fn)
export function sweep(b, type, fFn, q = 0.7071, gainDb = 0, sr = SR, step = 32) {
  const bq = new Biquad(type, fFn(0), typeof q === 'function' ? q(0) : q, gainDb, sr);
  for (let i = 0; i < b.length; i += step) {
    const t = i / sr; bq.set(fFn(t), typeof q === 'function' ? q(t) : q, gainDb, type);
    bq.run(b, i, Math.min(b.length, i + step));
  }
  return b;
}
export function onePoleLP(b, fc, sr = SR) {
  const a = Math.exp(-TAU * fc / sr); let y = 0;
  for (let i = 0; i < b.length; i++) { y = b[i] * (1 - a) + y * a; b[i] = y; }
  return b;
}
// Klatt-style formant resonator (unity DC gain)
export class Reson {
  constructor(sr = SR) { this.sr = sr; this.y1 = this.y2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(F, BW) {
    const T = 1 / this.sr; F = Math.min(F, this.sr * 0.45);
    this.C = -Math.exp(-TAU * BW * T); this.B = 2 * Math.exp(-Math.PI * BW * T) * Math.cos(TAU * F * T); this.A = 1 - this.B - this.C;
  }
  tick(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

// ---------------------------------------------------------------- generators
// Add an exponentially damped sinusoid ("grain"/mode ping) at sample position pos.
export function addTone(b, pos, f, tau, amp, phase = 0, sr = SR) {
  const start = Math.floor(pos); if (start >= b.length || f >= sr * 0.49) return;
  const w = TAU * f / sr, r = Math.exp(-1 / (tau * sr)), c1 = 2 * r * Math.cos(w), c2 = -r * r;
  const len = Math.min(b.length - start, Math.ceil(tau * sr * 7));
  let y2 = amp * Math.sin(phase - w) / r, y1 = amp * Math.sin(phase);
  let i = 0;
  if (start < 0) { // advance silently
    for (; i < -start && i < len; i++) { const y = c1 * y1 + c2 * y2; y2 = y1; y1 = y; }
  }
  for (; i < len; i++) { b[start + i] += y1; const y = c1 * y1 + c2 * y2; y2 = y1; y1 = y; }
}
// Add a chirping damped sine: frequency glides f0 -> f0*(1+rise) exponentially-ish over its life (bubble model)
export function addChirp(b, pos, f0, f1, tau, amp, glide = tau * 3, sr = SR, attack = 0.0005) {
  const start = Math.floor(pos), len = Math.min(b.length - start, Math.ceil(tau * sr * 7));
  if (start < 0 || len <= 0) return;
  let ph = 0; const ra = Math.exp(-1 / (tau * sr)); let e = amp; const na = Math.max(1, attack * sr);
  for (let i = 0; i < len; i++) {
    const t = i / sr, f = f0 + (f1 - f0) * Math.min(1, t / glide);
    ph += TAU * f / sr; const a = i < na ? i / na : 1;
    b[start + i] += Math.sin(ph) * e * a; e *= ra;
  }
}
// windowed noise burst
export function addNoise(b, pos, len, amp, r, attack = 0.1, sr = SR) {
  const s = Math.floor(pos), n = Math.max(2, Math.floor(len));
  const na = Math.max(1, Math.floor(n * attack));
  for (let i = 0; i < n && s + i < b.length; i++) {
    if (s + i < 0) continue;
    const e = i < na ? i / na : Math.exp(-4 * (i - na) / (n - na));
    b[s + i] += r.bi() * amp * e;
  }
}
// Poisson-distributed damped-sine grains (crackle/crunch/granular textures)
// o: { t0, dur, rate (grains/s at env=1), env(tSec)->0..1, fLo,fHi, tauLo,tauHi, pow (amp distribution), amp, densPow }
export function grains(b, r, o, sr = SR) {
  const step = 16, dt = step / sr, n = Math.floor(o.dur / dt), t0 = o.t0 || 0;
  const pow = o.pow ?? 2, amp = o.amp ?? 1, densPow = o.densPow ?? 1;
  for (let k = 0; k < n; k++) {
    const t = k * dt, e = o.env(t);
    if (e <= 1e-4) continue;
    let lam = o.rate * Math.pow(e, densPow) * dt;
    while (lam > 0) {
      if (r.next() < Math.min(lam, 1)) {
        const pos = (t0 + t) * sr + r.next() * step;
        const f = r.exp(o.fLo, o.fHi), tau = r.exp(o.tauLo, o.tauHi);
        const a = amp * e * Math.pow(r.next(), pow) * r.sign();
        if (o.chirp) addChirp(b, pos, f, f * (1 + o.chirp), tau, a, tau * 2, sr);
        else addTone(b, pos, f, tau, a, r.next() * TAU, sr);
      }
      lam -= 1;
    }
  }
  return b;
}
// modal resonator bank driven by an excitation signal; modes: [{f, tau, a}]
export function modal(exc, modes, sr = SR, outLen = exc.length) {
  const out = new Float32Array(outLen);
  for (const m of modes) {
    if (m.f >= sr * 0.48) continue;
    const r = Math.exp(-1 / (m.tau * sr)), w = TAU * m.f / sr, c1 = 2 * r * Math.cos(w), c2 = -r * r, g = m.a * Math.sin(w);
    let y1 = 0, y2 = 0; const n = outLen;
    for (let i = 0; i < n; i++) {
      const x = i < exc.length ? exc[i] : 0;
      const y = g * x + c1 * y1 + c2 * y2; y2 = y1; y1 = y; out[i] += y;
      if (i > exc.length && Math.abs(y) < 1e-7 && Math.abs(y2) < 1e-7) break;
    }
  }
  return out;
}
// Karplus-Strong plucked string
export function pluck(len, f, decay, bright, r, sr = SR) {
  const out = new Float32Array(len), N = Math.max(2, Math.round(sr / f)), d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = r.bi();
  let lp = 0; for (let i = 0; i < N; i++) { lp = lp + (d[i] - lp) * bright; d[i] = lp; }
  let idx = 0; const fb = decay;
  for (let i = 0; i < len; i++) {
    const a = d[idx], b2 = d[(idx + 1) % N];
    out[i] = a; d[idx] = fb * (a * (1 - bright * 0.5) + b2 * bright * 0.5); idx = (idx + 1) % N;
  }
  return out;
}

// ---------------------------------------------------------------- voice (glottal source + cascade formants)
// o: { dur, f0(u), amp(u), F:[fn|num x N], BW:[fn|num], jitter, shimmer, sub, breath, oq, growl, growlRate }  u = normalised time
const val = (v, u) => typeof v === 'function' ? v(u) : v;
export function voice(r, o, sr = SR) {
  const n = Math.ceil(o.dur * sr), out = new Float32Array(n);
  const F = o.F, BW = o.BW || [90, 110, 160, 250, 300], res = F.map(() => new Reson(sr));
  const jit = o.jitter ?? 0.01, shim = o.shimmer ?? 0.04, sub = o.sub ?? 0, breath = o.breath ?? 0.04;
  const oq = o.oq ?? 0.6, Tp = oq * 0.68, Tn = oq * 0.32, growl = o.growl ?? 0, gRate = o.growlRate ?? 30;
  let ph = 0, pj = 0, ps = 1, odd = false, f0 = 100, amp = 0, gph = 0, gAmp = 1, nz = 0;
  const kn = Math.PI / (2 * Tn);
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) {
      const u = i / n;
      for (let k = 0; k < res.length; k++) res[k].set(val(F[k], u), val(BW[k] ?? 300, u));
      f0 = o.f0(u); amp = o.amp(u);
    }
    ph += f0 * (1 + pj) / sr;
    if (ph >= 1) { ph -= Math.floor(ph); pj = r.gauss() * jit; ps = Math.max(0, 1 + r.gauss() * shim); odd = !odd; }
    let g;
    if (ph < Tp) g = 0.5 * Math.PI / Tp * Math.sin(Math.PI * ph / Tp) / kn;
    else if (ph < Tp + Tn) g = -Math.sin(Math.PI * (ph - Tp) / (2 * Tn));
    else g = 0;
    if (growl > 0) { gph += gRate * (1 + 0.3 * r.bi()) / sr; if (gph >= 1) { gph -= 1; gAmp = 1 - growl * r.next(); } }
    nz = nz * 0.3 + r.bi() * 0.7;
    const src = (g * ps * (odd ? 1 - sub : 1) * gAmp + nz * breath * (ph < Tp + Tn ? 1.0 : 0.35)) * amp;
    let x = src; for (let k = 0; k < res.length; k++) x = res[k].tick(x);
    out[i] = x;
  }
  filt(out, 'highpass', 50, 0.7, 0, sr);
  return out;
}

// ---------------------------------------------------------------- reverb
// Freeverb (Jezar) - used to bake reverb tails into ambience buffers. Returns mono (or [L,R] if stereo).
export function freeverb(input, o = {}, sr = SR) {
  const room = o.room ?? 0.8, damp = o.damp ?? 0.4, wet = o.wet ?? 0.3, dry = o.dry ?? 1, tail = o.tail ?? 2;
  const stereo = !!o.stereo, pre = Math.round((o.predelay ?? 0) * sr);
  const sc = sr / 44100, combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const n = input.length + Math.round(tail * sr);
  const mk = (spread) => ({
    combs: combT.map(t => ({ d: new Float32Array(Math.round((t + spread) * sc)), i: 0, s: 0 })),
    aps: apT.map(t => ({ d: new Float32Array(Math.round((t + spread) * sc)), i: 0 })), out: new Float32Array(n),
  });
  const chans = stereo ? [mk(0), mk(23)] : [mk(0)];
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  for (const ch of chans) {
    const { combs, aps, out } = ch;
    for (let i = 0; i < n; i++) {
      const xi = i - pre, x = (xi >= 0 && xi < input.length ? input[xi] : 0) * 0.015;
      let acc = 0;
      for (let c = 0; c < 8; c++) {
        const cb = combs[c], y = cb.d[cb.i];
        cb.s = y * d2 + cb.s * d1; cb.d[cb.i] = x + cb.s * fb; if (++cb.i >= cb.d.length) cb.i = 0; acc += y;
      }
      for (let a = 0; a < 4; a++) {
        const ap = aps[a], bo = ap.d[ap.i]; const y = -acc + bo; ap.d[ap.i] = acc + bo * 0.5; if (++ap.i >= ap.d.length) ap.i = 0; acc = y;
      }
      out[i] = acc * wet * 3 + (i < input.length ? input[i] * dry : 0);
    }
  }
  return stereo ? chans.map(c => c.out) : chans[0].out;
}
// Synthetic stereo impulse response for a ConvolverNode (decaying, darkening noise)
export function makeIR(seconds = 3, o = {}, sr = SR) {
  const r = new Rng(o.seed ?? 1234), n = Math.round(seconds * sr), t60 = o.t60 ?? seconds * 0.8;
  const lp0 = o.lpStart ?? 9000, lp1 = o.lpEnd ?? 900, pre = Math.round((o.predelay ?? 0.012) * sr);
  return [0, 1].map(ch => {
    const b = new Float32Array(n);
    for (let i = pre; i < n; i++) { const t = (i - pre) / sr; b[i] = r.bi() * Math.pow(10, -3 * t / t60); }
    // a few early reflections
    for (let k = 0; k < 10; k++) { const p = pre + Math.round(r.range(0.003, 0.08) * sr); if (p < n) b[p] += r.bi() * 0.6 * (1 - k / 12); }
    sweep(b, 'lowpass', t => lp1 + (lp0 - lp1) * Math.exp(-t / (seconds * 0.25)), 0.5, 0, sr, 64);
    fade(b, 0.004, 0.05, sr);
    const e = Math.sqrt(b.reduce((s, x) => s + x * x, 0)); scale(b, 1 / Math.max(1e-9, e) * 0.9 * (ch ? 1 : 1));
    return b;
  });
}

// ---------------------------------------------------------------- FFT / convolution (offline use)
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
export function convolve(sig, ir) {
  const L = sig.length + ir.length - 1; let N = 1; while (N < L) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(sig); br.set(ir); fft(ar, ai); fft(br, bi);
  for (let i = 0; i < N; i++) { const r = ar[i] * br[i] - ai[i] * bi[i], im = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; ai[i] = im; }
  fft(ar, ai, true);
  const out = new Float32Array(L); for (let i = 0; i < L; i++) out[i] = ar[i]; return out;
}
