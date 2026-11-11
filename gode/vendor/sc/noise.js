/* gode/vendor/sc/noise.js —— Survivalcraft（Game/SimplexNoise.cs）的噪声副本。
   与 SC 相同：置换表是与种子无关的固定 512 项（Perlin 原表），世界差异只来自生成器的四个 offset。
   C# 全是 float32；这里用 double 计算、常量取 float32 的十进制值，误差 ~1e-7，见 tools/scfit.js 的对拍阈值。 */

export const PERM = new Uint8Array([
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
]);

const GRAD3 = new Float64Array([
  1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
]);

// SimplexNoise.Noise(x, y)：返回 [0,1]（SC 原式 35*(n1+n2+n3)+0.5）
export function noise2(x, y) {
  const F2 = 0.366025418, G2 = 0.211324871, G2B = 0.422649741;
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + G2B, y2 = y0 - 1 + G2B;
  const ii = i & 0xFF, jj = j & 0xFF;
  const g0 = PERM[ii + PERM[jj]] % 12;
  const g1 = PERM[ii + i1 + PERM[jj + j1]] % 12;
  const g2 = PERM[ii + 1 + PERM[jj + 1]] % 12;
  let n = 0;
  let q = 0.5 - x0 * x0 - y0 * y0;
  if (q > 0) { q *= q; n += q * q * (GRAD3[g0 * 3] * x0 + GRAD3[g0 * 3 + 1] * y0); }
  q = 0.5 - x1 * x1 - y1 * y1;
  if (q > 0) { q *= q; n += q * q * (GRAD3[g1 * 3] * x1 + GRAD3[g1 * 3 + 1] * y1); }
  q = 0.5 - x2 * x2 - y2 * y2;
  if (q > 0) { q *= q; n += q * q * (GRAD3[g2 * 3] * x2 + GRAD3[g2 * 3 + 1] * y2); }
  return 35 * n + 0.5;
}

// SimplexNoise.OctavedNoise(x, y, frequency, octaves, frequencyStep, amplitudeStep, ridged?)
export function octaved2(x, y, freq, octaves, freqStep, ampStep, ridged = false) {
  let sum = 0, ampSum = 0, amp = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq);
    ampSum += amp;
    freq *= freqStep;
    amp *= ampStep;
  }
  const v = sum / ampSum;
  return ridged ? 1 - Math.abs(2 * v - 1) : v;
}

// SimplexNoise.Noise(x, y, z)：标准 3D simplex，SC 原式 16*(n1+n2+n3+n4)+0.5
export function noise3(x, y, z) {
  const F3 = 0.333333343, G3 = 0.16666667;
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let a, b, c, d, e, f;
  if (x0 >= y0) {
    if (y0 >= z0) { a = 1; b = 0; c = 0; d = 1; e = 1; f = 0; }
    else if (x0 >= z0) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 1; }
    else { a = 0; b = 0; c = 1; d = 1; e = 0; f = 1; }
  }
  else if (y0 < z0) { a = 0; b = 0; c = 1; d = 0; e = 1; f = 1; }
  else if (x0 < z0) { a = 0; b = 1; c = 0; d = 0; e = 1; f = 1; }
  else { a = 0; b = 1; c = 0; d = 1; e = 1; f = 0; }
  const x1 = x0 - a + G3, y1 = y0 - b + G3, z1 = z0 - c + G3;
  const x2 = x0 - d + F3, y2 = y0 - e + F3, z2 = z0 - f + F3;
  const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 0xFF, jj = j & 0xFF, kk = k & 0xFF;
  const g0 = PERM[ii + PERM[jj + PERM[kk]]] % 12;
  const g1 = PERM[ii + a + PERM[jj + b + PERM[kk + c]]] % 12;
  const g2 = PERM[ii + d + PERM[jj + e + PERM[kk + f]]] % 12;
  const g3 = PERM[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] % 12;
  const dot = (g, px, py, pz) => GRAD3[g * 3] * px + GRAD3[g * 3 + 1] * py + GRAD3[g * 3 + 2] * pz;
  let n = 0;
  let q = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (q > 0) { q *= q; n += q * q * dot(g0, x0, y0, z0); }
  q = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (q > 0) { q *= q; n += q * q * dot(g1, x1, y1, z1); }
  q = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (q > 0) { q *= q; n += q * q * dot(g2, x2, y2, z2); }
  q = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (q > 0) { q *= q; n += q * q * dot(g3, x3, y3, z3); }
  return 16 * n + 0.5;
}

// SimplexNoise.OctavedNoise(x, y, z, frequency, octaves, frequencyStep, amplitudeStep)
export function octaved3(x, y, z, freq, octaves, freqStep, ampStep) {
  let sum = 0, ampSum = 0, amp = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    ampSum += amp;
    freq *= freqStep;
    amp *= ampStep;
  }
  return sum / ampSum;
}
