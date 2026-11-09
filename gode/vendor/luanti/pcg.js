/* gode/vendor/luanti/pcg.js —— PCG32（Luanti 的 PcgRandom 语义，独立重写；参考：noise.cpp PcgRandom）。BigInt 实现，只在稀疏路径用（群系垂直渗透、日后的装饰 / 矿）。 */
const M64 = (1n << 64n) - 1n;
export class PcgRandom {
  constructor(state = 0x853c49e6748fea9bn, seq = 0xda3e39cb94b95bdbn) {
    this.s = 0n; this.inc = ((BigInt.asUintN(64, seq) << 1n) | 1n) & M64;
    this.next(); this.s = (this.s + BigInt.asUintN(64, BigInt(state))) & M64; this.next();
  }
  next() {
    const old = this.s;
    this.s = (old * 6364136223846793005n + this.inc) & M64;
    const xs = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn), rot = Number(old >> 59n);
    return ((xs >>> rot) | (xs << ((-rot) & 31))) >>> 0;
  }
  // [0, bound)，无偏（拒绝采样）；bound 0 = 整个 u32
  rangeU(bound) {
    if (bound === 0) return this.next();
    if (bound === 1) return 0;
    const th = (0x100000000 - bound) % bound;
    let r; while ((r = this.next()) < th);
    return r % bound;
  }
  range(min, max) { return this.rangeU(max - min + 1) + min; }   // [min, max]
}

/* 快速 PCG32：64 位状态拆成两个 u32（无 BigInt），与上面的 PcgRandom 逐值相同（tools/luanti/selftest.mjs 对拍）。装饰 / 矿这类热路径用它。 */
export class Pcg32 {
  constructor(state = 0, seq = 0xda3e39cb94b95bdbn, hi = undefined) {
    const s = typeof state === 'bigint' ? state : BigInt.asUintN(64, BigInt(Math.trunc(state)));
    const inc = ((BigInt.asUintN(64, BigInt(seq)) << 1n) | 1n) & M64;
    this.ih = Number(inc >> 32n) >>> 0; this.il = Number(inc & 0xffffffffn) >>> 0;
    this.sh = 0; this.sl = 0;
    this.next();
    this.add(Number(s >> 32n) >>> 0, Number(s & 0xffffffffn) >>> 0);
    this.next();
  }
  add(h, l) { const lo = this.sl + l; this.sh = (this.sh + h + (lo > 0xffffffff ? 1 : 0)) >>> 0; this.sl = lo >>> 0; }
  next() {
    const sh = this.sh, sl = this.sl;
    // state = state * 6364136223846793005 + inc  (mod 2^64)；乘数 = 0x5851F42D_4C957F2D
    const ml = 0x4C957F2D, mh = 0x5851F42D;
    const al = sl & 0xffff, ah = sl >>> 16, bl = ml & 0xffff, bh = ml >>> 16;
    const ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh, mid = lh + hl;
    const lo = ll + (mid % 65536) * 65536;
    const h0 = hh + Math.floor(mid / 65536) + Math.floor(lo / 4294967296), l0 = lo % 4294967296;
    let hi = (h0 + Math.imul(sl, mh) + Math.imul(sh, ml)) >>> 0;
    const l1 = l0 + this.il; hi = (hi + this.ih + (l1 > 0xffffffff ? 1 : 0)) >>> 0;
    this.sh = hi; this.sl = l1 >>> 0;
    // 输出用旧状态：xorshifted = ((old >> 18) ^ old) >> 27（取低 32 位），rot = old >> 59
    const lo32 = (((sh << 14) | (sl >>> 18)) ^ sl) >>> 0, hi32 = ((sh >>> 18) ^ sh) >>> 0;
    const xs = ((hi32 << 5) | (lo32 >>> 27)) >>> 0, rot = sh >>> 27;
    return ((xs >>> rot) | (xs << ((-rot) & 31))) >>> 0;
  }
  rangeU(bound) {
    if (bound === 0) return this.next();
    if (bound === 1) return 0;
    const th = (0x100000000 - bound) % bound;
    let r; while ((r = this.next()) < th);
    return r % bound;
  }
  range(min, max) { return this.rangeU(max - min + 1) + min; }
}
