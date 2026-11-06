// Deterministic hashing + PRNG utilities for world generation (no allocations in hot paths).

// murmur3 finalizer: good 32-bit avalanche
export function fmix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Combine a running hash with one more 32-bit value.
export function mix(h, v) {
  return fmix32(((h ^ fmix32(v | 0)) + 0x9e3779b9) | 0);
}

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return fmix32(h);
}

// Split a (possibly > 2^32) integer seed into two 32-bit words.
export function seedWords(seed) {
  if (typeof seed === 'bigint') seed = Number(BigInt.asIntN(53, seed));
  if (typeof seed === 'string') seed = hashString(seed);
  seed = Math.trunc(Number(seed) || 0);
  const lo = seed >>> 0;   // ToUint32 is exact modulo 2^32 for integer doubles
  const hi = Math.floor(seed / 4294967296) | 0;
  return [lo, hi];
}

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

// xoshiro128** PRNG
export class Rand {
  constructor(seed = 0) { this.a = 1; this.b = 0; this.c = 0; this.d = 0; this.setSeed(seed); }
  setSeed(seed) {
    // splitmix32-like expansion of a 32-bit seed into 128 bits of state
    let s = seed | 0, z;
    s = (s + 0x9e3779b9) | 0; z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); this.a = (z ^ (z >>> 16)) | 0;
    s = (s + 0x9e3779b9) | 0; z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); this.b = (z ^ (z >>> 16)) | 0;
    s = (s + 0x9e3779b9) | 0; z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); this.c = (z ^ (z >>> 16)) | 0;
    s = (s + 0x9e3779b9) | 0; z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); this.d = (z ^ (z >>> 16)) | 0;
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1;
    return this;
  }
  nextU32() {
    const b = this.b;
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9);
    const t = b << 9;
    this.c ^= this.a; this.d ^= b; this.b ^= this.c; this.a ^= this.d; this.c ^= t; this.d = rotl(this.d, 11);
    return r >>> 0;
  }
  // [0, 1)
  nextFloat() { return this.nextU32() * 2.3283064365386963e-10; }
  nextDouble() { return this.nextU32() * 2.3283064365386963e-10 + this.nextU32() * 5.421010862427522e-20; }
  // [0, n)
  nextInt(n) { return Math.floor(this.nextU32() * 2.3283064365386963e-10 * n); }
  // inclusive [a, b]
  between(a, b) { return a + Math.floor(this.nextU32() * 2.3283064365386963e-10 * (b - a + 1)); }
  nextBool() { return this.nextU32() >= 0x80000000; }
  chance(p) { return this.nextU32() * 2.3283064365386963e-10 < p; }
  uniform(a, b) { return a + this.nextFloat() * (b - a); }
  // Java-like "triangle" helpers used by vanilla placement
  triangleInt(min, max) { // vanilla TrapezoidHeight with plateau 0
    const k = max - min, l = k >> 1, m = k - l;
    return min + this.between(0, m) + this.between(0, l);
  }
  // biased-to-bottom int in [min, max] (vanilla BiasedToBottomInt)
  biasedToBottom(min, max) { return min + this.nextInt(this.nextInt(max - min + 1) + 1); }
}

// Position hash -> float in [0,1)
export function posRandom(seed, x, y, z) {
  let h = fmix32((seed ^ Math.imul(x | 0, 0x27d4eb2d)) | 0);
  h = fmix32((h ^ Math.imul(y | 0, 0x165667b1)) | 0);
  h = fmix32((h ^ Math.imul(z | 0, 0x61c88647)) | 0);
  return h * 2.3283064365386963e-10;
}
