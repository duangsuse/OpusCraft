// rgl/texpack.js —— TextureSource（goal-renderapi.ts §2b，labPBR）→ goodGL 的三个贴图阵列 + 每层 POM 深度表。
// 用法（rgl/index.js loadTextures）：
//   Textures.build → pgOverride → packLayers(tx, src)（包的 albedo 降到 16 写进 tx，给 PBR.build 推材质用；原分辨率留着）
//   → pgUnder → PBR.build → pgApplyMaps → finishSet(tx, pbr, pk)（包的 _n / _s 覆盖、spec.A 改成自发光、POM 深度进表、HD 放大）→ uploadSet
// 内部布局 = goodGL（vendor/gl/pbr.js 头注释），只有 spec.A 不同：goodGL 是 POM 深度，这里是自发光（0 = 不发光），POM 深度改由 pomTab[层] 给（fancy.js 读）。
//   labPBR 与 goodGL 的其余通道同义：_n RG 法线 / B AO / A 高度，_s R 光滑度 / G F0（≥ 230 金属）/ B 孔隙 0..64 · SSS 65..255；_s.A 255 = 不发光 → 0。
// 法线 Y：goodGL 的切线 B = uv.y 增大方向 = 图向下（PBR.build 的 ny = −(下 − 上)），即 DirectX（Y−）约定；包是 OpenGL（Y+）时 nrmY = 1 翻 G。
// 分辨率：没有包 = 16（走 vendor 的 uploadTextures / uploadPBR，逐字节同旧路径）；有包 = 包分辨率取 2 的幂、夹在 [16, max]，procgen 层最近邻放大。
import { SH } from '../vendor/gl/shared.js';

const TINT_ALL = new Set(['grass_top']);   // goodGL tintMode 2 只染 α < 0.5：草顶整张染（包里是灰草），侧面不染（包自带绿边）

/** from² → to²：缩小按块平均（albedo 按 α 加权，与旧 glsPack 同式），放大最近邻 */
function fit(src, from, to, alphaW) {
  if (from === to) return new Uint8Array(src);
  const out = new Uint8Array(to * to * 4);
  if (to > from) {
    for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) { const o = (Math.floor(y * from / to) * from + Math.floor(x * from / to)) * 4, p = (y * to + x) * 4; out[p] = src[o]; out[p + 1] = src[o + 1]; out[p + 2] = src[o + 2]; out[p + 3] = src[o + 3]; }
    return out;
  }
  for (let y = 0; y < to; y++) for (let x = 0; x < to; x++) {
    const x0 = Math.floor(x * from / to), x1 = Math.max(x0 + 1, Math.floor((x + 1) * from / to)), y0 = Math.floor(y * from / to), y1 = Math.max(y0 + 1, Math.floor((y + 1) * from / to));
    let r = 0, g = 0, b = 0, a = 0, w = 0, c = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * from + xx) * 4, k = alphaW ? src[o + 3] : 1; r += src[o] * k; g += src[o + 1] * k; b += src[o + 2] * k; a += src[o + 3]; w += k; c++; }
    const o = (y * to + x) * 4; out[o] = w ? r / w : 0; out[o + 1] = w ? g / w : 0; out[o + 2] = w ? b / w : 0; out[o + 3] = a / c;
  }
  return out;
}
const pow2 = v => { let r = 16; while (r * 2 <= v) r *= 2; return r; };
const clear = a => { for (let p = 3; p < a.length; p += 4) a[p] = 0; return a; };

/** 包 → { res, layers: Map(层 → { alb?, n?, s? }) }（都已是 res²）。包的 albedo 另降到 16 写进 tx.imgs / tx.data（PBR.build 从它推材质；pgtex 用 tx.imgs 的身份判断「层被包换过」） */
export function packLayers(tx, src, max = 128) {
  const from = src.res, res = Math.min(Math.max(16, max), pow2(from)), S = SH.TEX_NAMES, layers = new Map();
  for (let l = 0; l < tx.count; l++) {
    const L = src.get(S[l]); if (!L) continue;
    const e = {};
    if (L.albedo) {
      e.alb = fit(L.albedo, from, res, true); const a16 = res === 16 ? e.alb : fit(L.albedo, from, 16, true);
      if (TINT_ALL.has(S[l])) { clear(e.alb); clear(a16); }
      tx.imgs[l] = a16; tx.data.set(a16, l * 1024);
    }
    if (L.normal) e.n = fit(L.normal, from, res, false);
    if (L.specular) { const s = new Uint8Array(L.specular); for (let p = 3; p < s.length; p += 4) if (s[p] === 255) s[p] = 0; e.s = fit(s, from, res, false); }   // 255 = 不发光，先归零再平均
    layers.set(l, e);
  }
  return { res, layers };
}

/** pgtex 的 under 层（冰）：包的 albedo src-over 叠在 procgen 底（base16，最近邻放大）上，原分辨率版（16 的版本 pgUnder 自己做） */
export function underHD(pk, l, base16) {
  const e = pk.layers.get(l); if (!e || !e.alb || pk.res === 16) return;
  const b = fit(base16, 16, pk.res, false), p = e.alb;
  for (let i = 0; i < p.length; i += 4) {
    const pa = p[i + 3] / 255, ba = b[i + 3] / 255, a = pa + ba * (1 - pa);
    for (let k = 0; k < 3; k++) p[i + k] = a > 0 ? (p[i + k] * pa + b[i + k] * ba * (1 - pa)) / a : 0;
    p[i + 3] = a * 255;
  }
}

/** PBR.build（+ pgApplyMaps）之后：POM 深度挪进表、spec.A 归零（= 不发光），叠包的 _n / _s，必要时放大到包分辨率。
 *  opts.packPom：包给了 _n 而预设 pom = 0 的层用的深度（格）；opts.nrmY：1 = 包的法线是 OpenGL（Y+），翻 G */
export function finishSet(tx, pbr, pk, opts = {}) {
  const n = tx.count, pom = new Uint8Array(n);
  for (let l = 0; l < n; l++) { let m = 0; for (let i = l * 1024 + 3; i < (l + 1) * 1024; i += 4) { if (pbr.s[i] > m) m = pbr.s[i]; pbr.s[i] = 0; } pom[l] = m; }
  if (!pk) return { res: 16, alb: tx.data, n: pbr.n, s: pbr.s, pom, emit: false };
  const res = pk.res, N = res * res * 4, packPom = Math.round(Math.min(0.25, Math.max(0, opts.packPom ?? 0.125)) / 0.25 * 255);
  const hd = res !== 16, alb = hd ? new Uint8Array(n * N) : tx.data, nrm = hd ? new Uint8Array(n * N) : pbr.n, spec = hd ? new Uint8Array(n * N) : pbr.s;
  let emit = false;
  for (let l = 0; l < n; l++) {
    const e = pk.layers.get(l) || {}, o = l * N, lay = a => a.subarray(l * 1024, (l + 1) * 1024);
    if (hd) alb.set(e.alb || fit(tx.imgs[l], 16, res, false), o);
    if (e.n) {
      const v = e.n; let tall = false;
      for (let i = 0; i < N; i += 4) { nrm[o + i] = v[i]; nrm[o + i + 1] = opts.nrmY ? 255 - v[i + 1] : v[i + 1]; nrm[o + i + 2] = v[i + 2]; nrm[o + i + 3] = v[i + 3]; if (v[i + 3] < 250) tall = true; }
      if (tall && !pom[l]) pom[l] = packPom;
    } else if (hd) nrm.set(fit(lay(pbr.n), 16, res, false), o);
    if (e.s) { spec.set(e.s, o); for (let i = 3; i < N; i += 4) if (e.s[i]) { emit = true; break; } }
    else if (hd) spec.set(fit(lay(pbr.s), 16, res, false), o);
  }
  return { res, alb, n: nrm, s: spec, pom, emit };
}

function array(gl, res, n, levels, fill) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, res, res, n); fill(t);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, levels - 1);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

/** 上传：res 16 走 vendor 的 uploadTextures / uploadPBR（逐字节同旧路径）；HD 自己建阵列（albedo 的 mip 同 vendor：cutout 层保覆盖率）。另建 / 换 R.pomTab（R8，n × 1） */
export function uploadSet(gl, R, tx, set) {
  for (const k of ['tex', 'nrmTex', 'specTex', 'pomTab']) if (R[k]) { gl.deleteTexture(R[k]); R[k] = null; }
  const n = tx.count;
  if (set.res === 16) { R.uploadTextures(tx); R.uploadPBR({ n: set.n, s: set.s }, n); }
  else {
    const res = set.res, levels = Math.log2(res) + 1, cut = SH.TEX_NAMES.map(name => tx.isCutout(name));
    R.tex = array(gl, res, n, levels, () => {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, res, res, n, gl.RGBA, gl.UNSIGNED_BYTE, set.alb);
      let prev = set.alb, size = res;
      for (let lv = 1; lv < levels; lv++) {
        const ns = size >> 1, out = new Uint8Array(ns * ns * 4 * n);
        for (let l = 0; l < n; l++) for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
          let r = 0, g = 0, b = 0, a = 0, wsum = 0, cov = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const i = l * size * size * 4 + ((y * 2 + dy) * size + x * 2 + dx) * 4, al = prev[i + 3], w = cut[l] ? al / 255 + 0.001 : 1;
            r += prev[i] * w; g += prev[i + 1] * w; b += prev[i + 2] * w; a += al; wsum += w; if (al > 127) cov++;
          }
          const o = l * ns * ns * 4 + (y * ns + x) * 4;
          out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = cut[l] ? (cov >= 2 ? 255 : 0) : a / 4;
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, lv, 0, 0, 0, ns, ns, n, gl.RGBA, gl.UNSIGNED_BYTE, out);
        prev = out; size = ns;
      }
    });
    const mk = data => array(gl, res, n, levels, () => { gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, res, res, n, gl.RGBA, gl.UNSIGNED_BYTE, data); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); });
    R.nrmTex = mk(set.n); R.specTex = mk(set.s);
  }
  const t = R.pomTab = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, 1, 0, gl.RED, gl.UNSIGNED_BYTE, set.pom); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  R.texRes = set.res; R.emitOn = set.emit;
}
