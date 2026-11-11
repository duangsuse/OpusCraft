/* gode/vendor/sc/rand.js —— Survivalcraft 生成器用的随机数（Game/Random.cs，注意不是 Engine.Random）。
   生成器在 Game 命名空间里写 `new Random(seed)`，解析到的是这个类：种子先过 MathUtils.Hash，
   所以同一个世界种子在 Engine.Random 与 Game.Random 下会得到完全不同的 offset。

   Seed(int seed): s0 = Hash((uint)seed), s1 = Hash((uint)(seed + 1))
   UInt():         s2 = s1 ^ s0; s0 = rotl(s0,26) ^ s2 ^ (s2<<9); s1 = rotl(s2,13);
                   return rotl((uint)((int)s0 * -1640531525), 5) * 5
   （返回值里的乘法都是 uint32 环绕；Int() 取低 31 位。） */

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

// MathUtils.Hash(uint)
export function hash32(key) {
  key >>>= 0;
  key = (key ^ (key >>> 16)) >>> 0;
  key = Math.imul(key, 2146121005) >>> 0;
  key = (key ^ (key >>> 15)) >>> 0;
  key = Math.imul(key, 2221713035) >>> 0;
  key = (key ^ (key >>> 16)) >>> 0;
  return key;
}

export class Rand {
  constructor(seed) {
    this.seed(seed | 0);
  }

  seed(seed) {
    this.s0 = hash32(seed);
    this.s1 = hash32((seed + 1) | 0);
  }

  uint() {
    const s = this.s0, s2 = (this.s1 ^ this.s0) >>> 0;
    this.s0 = (rotl(s, 26) ^ s2 ^ ((s2 << 9) >>> 0)) >>> 0;
    this.s1 = rotl(s2, 13);
    return Math.imul(rotl(Math.imul(s, -1640531525) >>> 0, 5), 5) >>> 0;
  }

  int() {
    return this.uint() & 0x7FFFFFFF;
  }

  // int Int(int min, int max) => (int)(min + Int() * (long)(max - min + 1) / 2147483648L)
  irange(min, max) {
    return Math.trunc(min + this.int() * (max - min + 1) / 2147483648);
  }

  // float Float() => Int() / 2.147484E+09f
  float() {
    return this.int() / 2147484000;
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  chance(p) { return this.float() < p; }
}