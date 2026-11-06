// Builds WebGL texture arrays (albedo / normal+height / specular) from the procedural block painters.
import { allBlockTextureNames } from '../world/blocks.js';

const S = 16;

function fallbackTexture(name) {
  // deterministic noisy color derived from the name (used only if a painter is missing)
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  const r0 = 80 + (h & 127), g0 = 80 + ((h >> 7) & 127), b0 = 80 + ((h >> 14) & 127);
  const d = new Uint8ClampedArray(S * S * 4);
  let s = h;
  for (let i = 0; i < S * S; i++) {
    s = (s * 1103515245 + 12345) | 0;
    const n = ((s >> 16) & 31) - 16;
    d[i * 4] = r0 + n; d[i * 4 + 1] = g0 + n; d[i * 4 + 2] = b0 + n; d[i * 4 + 3] = 255;
  }
  return { frames: [d], height: new Float32Array(256).fill(0.5), smooth: 0.1, f0: 0.04, emissive: 0, sss: 0 };
}

function itemHeight(d) {
  const h = new Float32Array(256);
  for (let i = 0; i < 256; i++) h[i] = d[i * 4 + 3] > 0 ? 0.5 + (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765 * 0.3 : 0;
  return h;
}
const asArr = (v, def) => {
  if (v === undefined || v === null) return new Float32Array(256).fill(def);
  if (typeof v === 'number') return new Float32Array(256).fill(v);
  return v;
};

export async function buildBlockTextures(gl) {
  let painted = {};
  try {
    const mod = await import('./blocktex.js');
    painted = mod.paintBlockTextures();
  } catch (e) { console.warn('block textures unavailable, using fallback', e); }
  const names = allBlockTextureNames();
  for (const n of Object.keys(painted)) if (!names.includes(n)) names.push(n);
  // item sprites live in the same texture array as 'item/<name>' layers
  try {
    const im = await import('./itemtex.js');
    const items = im.paintItemTextures();
    for (const [n, t] of Object.entries(items)) {
      painted['item/' + n] = { frames: [t.data], height: itemHeight(t.data), smooth: 0.25, f0: /iron|gold|diamond|emerald|bucket|shears|compass|clock|minecart|chain|ingot|nugget/.test(n) ? 0.5 : 0.04, emissive: 0, sss: 0 };
      names.push('item/' + n);
    }
  } catch (e) { console.warn('item textures unavailable', e); }
  names.unshift('__missing');
  const layers = {};
  names.forEach((n, i) => { layers[n] = i; });
  const N = names.length;
  const albedo = new Uint8Array(N * S * S * 4);
  const normal = new Uint8Array(N * S * S * 4);
  const spec = new Uint8Array(N * S * S * 4);
  const animated = [];
  const texData = {};
  names.forEach((n, li) => {
    let t = painted[n];
    if (!t) {
      if (n === '__missing') {
        const d = new Uint8ClampedArray(S * S * 4);
        for (let i = 0; i < 256; i++) { const c = ((i & 15) < 8) !== ((i >> 4) < 8); d.set(c ? [248, 0, 248, 255] : [0, 0, 0, 255], i * 4); }
        t = { frames: [d] };
      } else t = fallbackTexture(n);
    }
    texData[n] = t;
    albedo.set(t.frames[0], li * 1024);
    // normals from height (wrapping sobel), alpha = height
    const H = asArr(t.height, 0.5);
    const strength = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const h = (xx, yy) => H[((yy + S) % S) * S + ((xx + S) % S)];
      // only use neighbors that are not transparent so cutout edges stay flat
      const dx = (h(x + 1, y) - h(x - 1, y)) * 0.5, dy = (h(x, y + 1) - h(x, y - 1)) * 0.5;
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (li * 256 + y * S + x) * 4;
      normal[i] = (nx * 0.5 + 0.5) * 255; normal[i + 1] = (ny * 0.5 + 0.5) * 255; normal[i + 2] = (nz * 0.5 + 0.5) * 255; normal[i + 3] = H[y * S + x] * 255;
    }
    const sm = asArr(t.smooth, 0.1), f0 = asArr(t.f0, 0.04), em = asArr(t.emissive, 0);
    const sss = typeof t.sss === 'number' ? t.sss : 0;
    for (let i = 0; i < 256; i++) {
      const o = (li * 256 + i) * 4;
      spec[o] = sm[i] * 255; spec[o + 1] = Math.min(1, f0[i]) * 255; spec[o + 2] = sss * 255; spec[o + 3] = em[i] * 255;
    }
    if (t.frames.length > 1) animated.push({ layer: li, frames: t.frames, frameTime: t.frameTime || 2, cur: 0, timer: 0 });
  });

  const mk = (data, mips) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, S, S, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, mips ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (mips) {
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 4);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }
    return { tex, target: gl.TEXTURE_2D_ARRAY };
  };
  const res = {
    layers, names, count: N, texData,
    albedo: mk(albedo, true), normal: mk(normal, true), specular: mk(spec, true),
    animated,
    albedoData: albedo,
  };
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) {
    for (const t of [res.albedo, res.normal, res.specular]) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t.tex);
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    }
  }
  return res;
}

// advance animated textures by one game tick
export function tickAnimatedTextures(gl, atlas) {
  let changed = false;
  for (const a of atlas.animated) {
    if (++a.timer < a.frameTime) continue;
    a.timer = 0;
    a.cur = (a.cur + 1) % a.frames.length;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas.albedo.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, a.layer, S, S, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(a.frames[a.cur].buffer, a.frames[a.cur].byteOffset, 1024));
    changed = true;
  }
  if (changed) {
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas.albedo.tex);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }
}
