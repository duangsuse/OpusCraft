// java.util.Random (48-bit LCG) — used to reproduce vanilla's star field and other seeded visuals exactly.
const MULT = 0x5DEECE66Dn, ADD = 0xBn, MASK = (1n << 48n) - 1n;
export class JavaRandom {
  constructor(seed) { this.seed = (BigInt(seed) ^ MULT) & MASK; }
  next(bits) {
    this.seed = (this.seed * MULT + ADD) & MASK;
    let r = Number(this.seed >> BigInt(48 - bits));
    if (bits === 32 && r >= 2 ** 31) r -= 2 ** 32; // (int) cast
    return r;
  }
  nextInt(n) {
    if (n === undefined) return this.next(32);
    if ((n & -n) === n) return Number((BigInt(n) * BigInt(this.next(31))) >> 31n);
    let bits, val;
    do { bits = this.next(31); val = bits % n; } while (bits - val + (n - 1) < 0);
    return val;
  }
  nextFloat() { return this.next(24) / (1 << 24); }
  nextDouble() { return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992; }
}
