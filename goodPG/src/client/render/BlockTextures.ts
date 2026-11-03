// Sube las texturas de bloques generadas a tres TEXTURE_2D_ARRAY (albedo sRGB, normal+altura
// y especular) con mipmaps calculados en CPU (preservando la cobertura alpha de los recortes).
import type { GL, GLCaps } from '../engine/gl';
import { TEXTURE_DEFS } from '../../shared/textureDefs';
import type { GeneratedTextures } from '../textures/generateTextures';

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

const SRGB_TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) SRGB_TO_LIN[i] = srgbToLinear(i);

type MipKind = 'albedo' | 'normal' | 'linear';

/** Reduce un nivel (size -> size/2) de todas las capas. */
function downsample(src: Uint8Array, size: number, count: number, kind: MipKind, cutout: boolean[]): Uint8Array {
  const half = size >> 1;
  const dst = new Uint8Array(half * half * 4 * count);
  for (let l = 0; l < count; l++) {
    const so = l * size * size * 4;
    const doff = l * half * half * 4;
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const idx = [
          so + ((y * 2) * size + x * 2) * 4,
          so + ((y * 2) * size + x * 2 + 1) * 4,
          so + ((y * 2 + 1) * size + x * 2) * 4,
          so + ((y * 2 + 1) * size + x * 2 + 1) * 4,
        ];
        const o = doff + (y * half + x) * 4;
        if (kind === 'albedo') {
          let r = 0, g = 0, b = 0, a = 0, wsum = 0;
          for (const i of idx) {
            const w = cutout[l] ? src[i + 3] / 255 : 1;
            r += SRGB_TO_LIN[src[i]] * w;
            g += SRGB_TO_LIN[src[i + 1]] * w;
            b += SRGB_TO_LIN[src[i + 2]] * w;
            a += src[i + 3];
            wsum += w;
          }
          if (wsum > 0) {
            dst[o] = linearToSrgb(r / wsum);
            dst[o + 1] = linearToSrgb(g / wsum);
            dst[o + 2] = linearToSrgb(b / wsum);
          }
          dst[o + 3] = Math.round(a / 4);
        } else if (kind === 'normal') {
          let nx = 0, ny = 0, nz = 0, h = 0;
          for (const i of idx) {
            nx += src[i] / 127.5 - 1;
            ny += src[i + 1] / 127.5 - 1;
            nz += src[i + 2] / 127.5 - 1;
            h += src[i + 3];
          }
          const len = Math.hypot(nx, ny, nz) || 1;
          dst[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
          dst[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
          dst[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
          dst[o + 3] = Math.round(h / 4);
        } else {
          for (let c = 0; c < 4; c++) {
            dst[o + c] = Math.round((src[idx[0] + c] + src[idx[1] + c] + src[idx[2] + c] + src[idx[3] + c]) / 4);
          }
        }
      }
    }
  }
  return dst;
}

/** Ajusta el alpha de un nivel de mip para conservar la cobertura del test alpha (0.5). */
function preserveCoverage(level: Uint8Array, size: number, layer: number, target: number): void {
  const o = layer * size * size * 4;
  const n = size * size;
  const coverage = (scale: number) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (level[o + i * 4 + 3] * scale >= 127.5) c++;
    return c / n;
  };
  let lo = 0.5, hi = 8;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    if (coverage(mid) < target) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  for (let i = 0; i < n; i++) {
    const k = o + i * 4 + 3;
    level[k] = Math.min(255, Math.round(level[k] * s));
  }
}

export class BlockTextures {
  albedo: WebGLTexture;
  normal: WebGLTexture;
  specular: WebGLTexture;
  layerProps: WebGLTexture;
  readonly size: number;
  readonly count: number;
  readonly source: GeneratedTextures;

  constructor(gl: GL, caps: GLCaps, tex: GeneratedTextures) {
    this.source = tex;
    this.size = tex.size;
    this.count = tex.count;
    const cutout = TEXTURE_DEFS.map((d) => !!d.cutout);
    this.albedo = this.uploadArray(gl, caps, tex.albedo, gl.SRGB8_ALPHA8, 'albedo', cutout);
    this.normal = this.uploadArray(gl, caps, tex.normal, gl.RGBA8, 'normal', cutout);
    this.specular = this.uploadArray(gl, caps, tex.specular, gl.RGBA8, 'linear', cutout);

    const props = new Uint8Array(this.count * 4);
    TEXTURE_DEFS.forEach((d, i) => {
      props[i * 4] = d.tint ?? 0;
      props[i * 4 + 1] = d.wave ?? 0;
      props[i * 4 + 2] = Math.round((d.sss ?? 0) * 255);
      props[i * 4 + 3] = d.special ?? 0;
    });
    this.layerProps = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.layerProps);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.count, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, props);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private uploadArray(
    gl: GL, caps: GLCaps, data: Uint8Array, internalFormat: number, kind: MipKind, cutout: boolean[],
  ): WebGLTexture {
    const size = this.size;
    const count = this.count;
    const levels = Math.log2(size) + 1;
    // WebGL 2 garantiza 256 capas; casi todas las tarjetas admiten 2048.
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number;
    if (count > maxLayers) console.error(`La tarjeta gráfica admite ${maxLayers} capas de textura y hacen falta ${count}.`);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, internalFormat, size, size, count);
    let level = data;
    let s = size;
    // Cobertura alpha original de cada capa con recorte.
    const baseCoverage = cutout.map((c, l) => {
      if (!c || kind !== 'albedo') return 0;
      let n = 0;
      for (let i = 0; i < size * size; i++) if (data[l * size * size * 4 + i * 4 + 3] >= 128) n++;
      return n / (size * size);
    });
    for (let lv = 0; lv < levels; lv++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, lv, 0, 0, 0, s, s, count, gl.RGBA, gl.UNSIGNED_BYTE, level);
      if (lv < levels - 1) {
        level = downsample(level, s, count, kind, cutout);
        s >>= 1;
        if (kind === 'albedo') {
          for (let l = 0; l < count; l++) if (cutout[l] && baseCoverage[l] > 0) preserveCoverage(level, s, l, baseCoverage[l]);
        }
      }
    }
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (caps.anisoExt) {
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, caps.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, caps.anisotropy));
    }
    return t;
  }
}
