// water/surfacefield.js —— 以世界格坐标为索引的环形（toroidal）2D 场：岸线 / 水面高度（goal-remix/water.md §0.1 选项 ②），Eulerian 波纹以后挂在同一套坐标上。
// 纯 JS（不碰 GL / THREE）：宿主渲染器自己把 `data` 上传成 RG8UI 纹理（上传哪几块由 takeDirty() 给出）。
//   texel(x, z) = world 格 (x mod N, z mod N)；N 取 2 的幂，N ≥ 已加载区块直径 + 余量，否则相距 N 格的两列会互相覆盖
//   R = 0 无信息 / 1 水面列（G = 最上面一格水的 y）/ 2 实心列（G = 最高实心格的 y；花草火把不算）
//   shoreDist 的邻格判据：邻列 R == 2 且 G ≥ 查询格的 y  ⇔  v2 里 voxAt(邻格) 是非流体实心（见 water/glsl.js SHORE）
export class SurfaceField {
  constructor({ N = 256, H = 96, waterId, solid, yzx = false }) {
    this.yzx = yzx;   // true = gode 的 YZX u16（idx = y<<8 | z<<4 | x，type = v & 0xfff）
    this.N = N; this.H = H; this.waterId = waterId; this.solid = solid;   // solid: Uint8Array，按方块 id（用 occupied，立方体 / 台阶等；花草 / 火把为 0）
    this.data = new Uint8Array(N * N * 2); this.dirty = new Map();       // key = cx,cz → [cx, cz]
  }
  setChunk(cx, cz, blocks) {
    const { N, H, waterId, solid, data, yzx } = this, m = N - 1;
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
      const base = (lx * 16 + lz) * H, col = (lz << 4) | lx; let r = 0, g = 0;
      for (let y = H - 1; y >= 0; y--) { const id = yzx ? blocks[(y << 8) | col] & 0xfff : blocks[base + y]; if (id === 0) continue; if (id === waterId) { r = 1; g = y; break; } if (solid[id]) { r = 2; g = y; break; } }
      const i = (((cz * 16 + lz) & m) * N + ((cx * 16 + lx) & m)) * 2; data[i] = r; data[i + 1] = g;
    }
    this.dirty.set(cx + ',' + cz, [cx, cz]);
  }
  clearChunk(cx, cz) {
    const { N, data } = this, m = N - 1;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) { const i = (((cz * 16 + lz) & m) * N + ((cx * 16 + lx) & m)) * 2; data[i] = 0; data[i + 1] = 0; }
    this.dirty.set(cx + ',' + cz, [cx, cz]);
  }
  takeDirty() { const a = [...this.dirty.values()]; this.dirty.clear(); return a; }
  // 把一个区块的 16×16 texel 拷成连续缓冲（texSubImage2D 用）；区块跨环边界时 16 | N 保证不会被切开
  chunkRect(cx, cz, out = new Uint8Array(16 * 16 * 2)) {
    const { N, data } = this, m = N - 1;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) { const i = (((cz * 16 + lz) & m) * N + ((cx * 16 + lx) & m)) * 2, o = (lz * 16 + lx) * 2; out[o] = data[i]; out[o + 1] = data[i + 1]; }
    return { x: (cx * 16) & m, y: (cz * 16) & m, data: out };
  }
}
