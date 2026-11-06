// Minimal fallback terrain generator (used only if the real generator module fails to load).
import { ID, mk } from './blocks.js';
import { MIN_Y } from './constants.js';

function hash(x, z, s) { let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function smooth(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export class Generator {
  constructor(seed) { this.seed = seed | 0; }
  height(x, z) {
    let h = 0, amp = 1, f = 1 / 64;
    for (let o = 0; o < 4; o++) { h += smooth(x * f, z * f, this.seed + o) * amp; amp *= 0.5; f *= 2; }
    return Math.floor(56 + h * 24);
  }
  generateChunk(cx, cz, blocks) {
    const biomes = new Uint8Array(256);
    const outside = [];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const h = this.height(wx, wz);
      for (let y = MIN_Y; y <= Math.max(h, 63); y++) {
        let v = 0;
        if (y === MIN_Y) v = ID.bedrock;
        else if (y < 0) v = ID.deepslate;
        else if (y < h - 3) v = ID.stone;
        else if (y < h) v = h < 65 ? ID.sand : ID.dirt;
        else if (y === h) v = h < 65 ? ID.sand : ID.grass_block;
        else if (y <= 63) v = ID.water;
        blocks[((y - MIN_Y) * 16 + z) * 16 + x] = v;
      }
      if (h >= 65 && hash(wx, wz, 7) < 0.15) blocks[((h + 1 - MIN_Y) * 16 + z) * 16 + x] = ID.short_grass;
      if (h >= 65 && x > 2 && x < 13 && z > 2 && z < 13 && hash(wx, wz, 9) < 0.01) {
        for (let i = 1; i <= 5; i++) blocks[((h + i - MIN_Y) * 16 + z) * 16 + x] = mk(ID.oak_log, 0);
        for (let dy = 3; dy <= 6; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const r = dy >= 5 ? 1 : 2;
          if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
          const i = ((h + dy - MIN_Y) * 16 + z + dz) * 16 + x + dx;
          if (!blocks[i]) blocks[i] = ID.oak_leaves;
        }
      }
    }
    return { biomes, outside: new Int32Array(outside) };
  }
  biomeAt() { return 1; }
  findSpawn() { return [0.5, this.height(0, 0) + 1, 0.5]; }
}
