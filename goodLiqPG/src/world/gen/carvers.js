// Carvers: vanilla-style worm caves ("cave", "cave_extra_underground") and ravines ("canyon").
// Every chunk replays carver starts of all chunks within RANGE and carves only its own blocks -> order independent.
import { ID } from '../blocks.js';
import { Rand, mix } from './rng.js';

const RANGE = 8;
const AIR = 0, WATER = ID.water, LAVA = ID.lava, GRASS = ID.grass_block, DIRT = ID.dirt;
const LAVA_LEVEL = -55;
const CARVABLE = new Uint8Array(4096);
for (const n of ['stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'dirt', 'grass_block', 'podzol', 'coarse_dirt', 'sand', 'red_sand',
  'gravel', 'sandstone', 'red_sandstone', 'terracotta', 'white_terracotta', 'orange_terracotta', 'yellow_terracotta', 'brown_terracotta',
  'red_terracotta', 'light_gray_terracotta', 'snow_block', 'clay', 'packed_ice', 'coal_ore', 'iron_ore', 'copper_ore', 'deepslate_iron_ore', 'deepslate_copper_ore']) CARVABLE[ID[n]] = 1;

export class Carvers {
  constructor(seed) {
    this.seed = seed;
    this.rng = new Rand(0);
    this.trng = new Rand(0);
    this.blocks = null; this.cx = 0; this.cz = 0; this.wet = null;
    this.widths = new Float32Array(384);
  }

  carve(gen, cx, cz, blocks) {
    this.blocks = blocks; this.cx = cx; this.cz = cz; this.gen = gen;
    const rng = this.rng;
    for (let dz = -RANGE; dz <= RANGE; dz++) for (let dx = -RANGE; dx <= RANGE; dx++) {
      const sx = cx + dx, sz = cz + dz;
      const base = mix(mix(this.seed, sx), sz);
      rng.setSeed(mix(base, 1));
      if (rng.nextFloat() < 0.01) this.canyon(rng, sx, sz);
      if (Math.abs(dx) <= 6 && Math.abs(dz) <= 6) {
        rng.setSeed(mix(base, 2));
        if (rng.nextFloat() < 0.15) this.caves(rng, sx, sz, -56, 180);
        rng.setSeed(mix(base, 3));
        if (rng.nextFloat() < 0.07) this.caves(rng, sx, sz, -56, 47);
      }
    }
  }

  // ---- worm caves ---------------------------------------------------------------------------------------
  caves(rng, sx, sz, yMin, yMax) {
    const range = 4;
    const maxLen = (range * 2 - 1) * 16;
    const n = rng.nextInt(rng.nextInt(rng.nextInt(15) + 1) + 1);
    for (let k = 0; k < n; k++) {
      const x = sx * 16 + rng.nextInt(16);
      const y = yMin + rng.nextInt(yMax - yMin + 1);
      const z = sz * 16 + rng.nextInt(16);
      const hm = 0.7 + rng.nextFloat() * 0.7;
      const vm = 0.8 + rng.nextFloat() * 0.5;
      const floor = -1 + rng.nextFloat() * 0.6;
      let m = 1;
      if (rng.nextInt(4) === 0) {
        const ys = 0.1 + rng.nextFloat() * 0.8;
        const radius = 1 + rng.nextFloat() * 6;
        const d = 1.5 + radius;
        this.ellipsoid(x + 1, y, z, d, d * ys, floor, 0);
        m += rng.nextInt(4);
      }
      for (let p = 0; p < m; p++) {
        const yaw = rng.nextFloat() * Math.PI * 2;
        const pitch = (rng.nextFloat() - 0.5) / 4;
        let th = rng.nextFloat() * 2 + rng.nextFloat();
        if (rng.nextInt(10) === 0) th *= rng.nextFloat() * rng.nextFloat() * 3 + 1;
        const len = maxLen - rng.nextInt(maxLen >> 2);
        this.tunnel(rng.nextU32(), x, y, z, hm, vm, th, yaw, pitch, 0, len, 1, floor);
      }
    }
  }

  tunnel(seed, x, y, z, hm, vm, thickness, yaw, pitch, start, count, hvRatio, floor) {
    const r = new Rand(seed);
    const branchAt = r.nextInt(count >> 1) + (count >> 2);
    const steep = r.nextInt(6) === 0;
    let f = 0, g = 0;
    const midX = this.cx * 16 + 8, midZ = this.cz * 16 + 8;
    for (let j = start; j < count; j++) {
      const d = 1.5 + Math.sin(Math.PI * j / count) * thickness;
      const e = d * hvRatio;
      const h = Math.cos(pitch);
      x += Math.cos(yaw) * h; y += Math.sin(pitch); z += Math.sin(yaw) * h;
      pitch *= steep ? 0.92 : 0.7;
      pitch += g * 0.1; yaw += f * 0.1;
      g *= 0.9; f *= 0.75;
      g += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 2;
      f += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 4;
      if (j === branchAt && thickness > 1) {
        this.tunnel(r.nextU32(), x, y, z, hm, vm, r.nextFloat() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, j, count, 1, floor);
        this.tunnel(r.nextU32(), x, y, z, hm, vm, r.nextFloat() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, j, count, 1, floor);
        return;
      }
      if (r.nextInt(4) !== 0) {
        const ddx = x - midX, ddz = z - midZ, rem = count - j, w = thickness + 2 + 16;
        if (ddx * ddx + ddz * ddz - rem * rem > w * w) return;
        this.ellipsoid(x, y, z, d * hm, e * vm, floor, 0);
      }
    }
  }

  // ---- canyons -----------------------------------------------------------------------------------------
  canyon(rng, sx, sz) {
    const maxLen = (4 * 2 - 1) * 16;
    const x = sx * 16 + rng.nextInt(16);
    const y = 10 + rng.nextInt(58);
    const z = sz * 16 + rng.nextInt(16);
    const yaw = rng.nextFloat() * Math.PI * 2;
    const pitch = -0.125 + rng.nextFloat() * 0.25;
    const yScale = 3;
    const thickness = rng.nextFloat() * 4 + rng.nextFloat() * 2;
    const len = Math.trunc(maxLen * (0.75 + rng.nextFloat() * 0.25));
    this.canyonCarve(rng.nextU32(), x, y, z, thickness, yaw, pitch, 0, len, yScale);
  }

  canyonCarve(seed, x, y, z, thickness, yaw, pitch, start, count, hvRatio) {
    const r = new Rand(seed);
    const widths = this.widths;
    let wf = 1;
    for (let j = 0; j < 384; j++) {
      if (j === 0 || r.nextInt(3) === 0) wf = 1 + r.nextFloat() * r.nextFloat();
      widths[j] = wf * wf;
    }
    let f = 0, g = 0;
    const midX = this.cx * 16 + 8, midZ = this.cz * 16 + 8;
    for (let i = start; i < count; i++) {
      let d = 1.5 + Math.sin(i * Math.PI / count) * thickness;
      let e = d * hvRatio;
      d *= 0.75 + r.nextFloat() * 0.25;
      e = e * (0.75 + r.nextFloat() * 0.25);
      const h = Math.cos(pitch), jj = Math.sin(pitch);
      x += Math.cos(yaw) * h; y += jj; z += Math.sin(yaw) * h;
      pitch *= 0.7;
      pitch += g * 0.05; yaw += f * 0.05;
      g *= 0.8; f *= 0.5;
      g += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 2;
      f += (r.nextFloat() - r.nextFloat()) * r.nextFloat() * 4;
      if (r.nextInt(4) !== 0) {
        const ddx = x - midX, ddz = z - midZ, rem = count - i, w = thickness + 2 + 16;
        if (ddx * ddx + ddz * ddz - rem * rem > w * w) return;
        this.ellipsoid(x, y, z, d, e, -2, 1);
      }
    }
  }

  // ---- carving -----------------------------------------------------------------------------------------
  // mode 0: cave (skip below floor level), mode 1: canyon (width factors per y)
  ellipsoid(x, y, z, hr, vr, floorLevel, mode) {
    const cx0 = this.cx * 16, cz0 = this.cz * 16;
    const mx = cx0 + 8, mz = cz0 + 8, f = 16 + hr * 2;
    if (Math.abs(x - mx) > f || Math.abs(z - mz) > f) return;
    const k0 = Math.max(Math.floor(x - hr) - cx0 - 1, 0), k1 = Math.min(Math.floor(x + hr) - cx0, 15);
    const p0 = Math.max(Math.floor(z - hr) - cz0 - 1, 0), p1 = Math.min(Math.floor(z + hr) - cz0, 15);
    if (k0 > k1 || p0 > p1) return;
    const yLo = Math.max(Math.floor(y - vr) - 1, -63), yHi = Math.min(Math.floor(y + vr) + 1, 319 - 7);
    const blocks = this.blocks, widths = this.widths, gen = this.gen;
    for (let lx = k0; lx <= k1; lx++) {
      const gx = (cx0 + lx + 0.5 - x) / hr;
      for (let lz = p0; lz <= p1; lz++) {
        const gz = (cz0 + lz + 0.5 - z) / hr;
        const hd = gx * gx + gz * gz;
        if (hd >= 1) continue;
        const col = lz * 16 + lx;
        let grass = false;
        for (let v = yHi; v > yLo; v--) {
          const w = (v - 0.5 - y) / vr;
          if (mode === 0) { if (w <= floorLevel || hd + w * w >= 1) continue; }
          else if (hd * widths[v + 64 - 1] + w * w / 6 >= 1) continue;
          const i = col + (v + 64) * 256;
          const b = blocks[i];
          if (!CARVABLE[b]) continue;
          // never open holes into water above
          const above = blocks[i + 256];
          if (above === WATER || above === ID.ice) continue;
          let nv = AIR;
          if (v <= LAVA_LEVEL) nv = LAVA;
          else if (v < 63) { const fl = gen.caveFluid(col); if (fl === 2) continue; if (fl === 1) nv = WATER; }
          if (b === GRASS) grass = true;
          blocks[i] = nv;
          if (grass && blocks[i - 256] === DIRT) blocks[i - 256] = GRASS;
        }
      }
    }
  }
}
