// water/noise.js —— 水面噪声贴图数据（可平铺 128²：RG = 斜率，B = 高度；4 层值噪声 → bump）。
// v2/gl 与 rgl 共用同一份（水下焦散 / 岸线波纹的图样靠它一致）；纯 JS，不碰 THREE / GL：各宿主自己上传。
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function waterNoiseData() {
    const N = 128, H = new Float32Array(N * N);
    const hash = (x, y, s) => {
      let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const sm = t => t * t * (3 - 2 * t);
    const vn = (x, y, per, s) => {                     // 格点周期 = per → 采样范围 0..per 时无缝平铺
      const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
      const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
      const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), e = hash(x1, y1, s);
      return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, amp = 1, per = 4;
      for (let o = 0; o < 4; o++) { v += amp * vn(x / N * per, y / N * per, per, o * 31 + 7); amp *= 0.55; per *= 2; }
      H[y * N + x] = v;
    }
    const data = new Uint8Array(N * N * 4), K = 1.4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = (H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N]) * 0.5 * K;
      const gy = (H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x]) * 0.5 * K;
      const o = (y * N + x) * 4;
      data[o] = clamp(Math.round((0.5 - gx) * 255), 0, 255);
      data[o + 1] = clamp(Math.round((0.5 - gy) * 255), 0, 255);
      data[o + 2] = clamp(Math.round(H[y * N + x] * 90), 0, 255);
      data[o + 3] = 255;
    }
    return { N, data };
}
