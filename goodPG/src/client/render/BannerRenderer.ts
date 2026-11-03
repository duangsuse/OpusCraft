// Fase 6.5 (libros y estandartes): tela de los estandartes con dibujos. El bloque dibuja la tela lisa;
// encima, cada estandarte con capas es una caja algo mayor que la tela con una textura propia (su fondo
// y sus capas, compuestos en bannerArt.ts y cacheados mientras no cambien), iluminada como las criaturas
// (sol con sombras, cielo y luz de bloques de su celda). Así no se gasta ninguna capa de textura.
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';
import { ATMOSPHERE } from './shaders/atmosphere';
import { LIGHTING } from './shaders/terrain';
import { bannerPixels, BANNER_W, BANNER_H } from './bannerArt';
import type { BannerLayer } from '../../shared/bannerPatterns';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
out vec3 vRel;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vRel = aPos;
  vNormal = aNormal;
  vUV = aUV;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uCloth;
uniform vec2 uLightLevel;
in vec3 vRel;
in vec3 vNormal;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 albedo = srgbToLinear(texture(uCloth, vUV).rgb);
  vec3 N = normalize(vNormal);
  vec3 L = uLightDir.xyz;
  float NdotL = saturate(dot(N, L));
  float shadow = 0.0;
  if (NdotL > 0.0) shadow = sampleShadow(shadowCoord(vRel, N), gl_FragCoord.xy, 1.5);
  vec3 lightCol = uLightColor.rgb * shadow * cloudShadow(vRel + uCamPos.xyz);
  vec3 col = albedo / PI * NdotL * lightCol;
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * N.y);
  vec3 ac = ambientCube(N);
  ac = mix(vec3(dot(ac, vec3(0.2126, 0.7152, 0.0722))), ac, 0.55);
  vec3 amb = (ac * 1.6 + bounce) * skyLightCurve(uLightLevel.x) + blockLightColor(uLightLevel.y) + vec3(0.012, 0.013, 0.016);
  col += albedo / PI * amb;
  outColor = vec4(col, 1.0);
}
`;

export interface BannerDraw {
  x: number;
  y: number;
  z: number;
  /** Hacia dónde mira el frente (0 N, 1 E, 2 S, 3 O). */
  facing: number;
  /** En la pared (tela colgando del travesaño hasta el bloque de abajo) o de pie. */
  wall: boolean;
  /** Color de fondo (índice de tinte) y capas. */
  base: number;
  layers: readonly BannerLayer[];
}

interface Cached {
  tex: WebGLTexture;
  key: string;
  seen: number;
}

/** Tela en dieciseisavos, mirando al norte (frente en -Z): de pie y en la pared (como en colors.ts). */
const STAND: [number, number, number, number, number, number] = [1, 3, 5, 15, 28, 6];
const WALL: [number, number, number, number, number, number] = [1, -12, 15, 15, 14, 16];
/** Cuánto sobresale la caja de la tela lisa (en dieciseisavos). */
const GROW = 0.12;
const FLOATS = 8;

export class BannerRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cache = new Map<string, Cached>();
  private frame = 0;
  private data = new Float32Array(36 * FLOATS);

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'banner-cloth', vs: VS, fs: FS });
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.bindVertexArray(null);
  }

  /** Textura de la tela (se rehace sólo si cambian el fondo o las capas). */
  private texture(pos: string, base: number, layers: readonly BannerLayer[]): WebGLTexture {
    const gl = this.gl;
    const key = `${base}|${layers.map((l) => l.join('.')).join(',')}`;
    let c = this.cache.get(pos);
    if (c && c.key === key) {
      c.seen = this.frame;
      return c.tex;
    }
    const tex = c?.tex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BANNER_W, BANNER_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, bannerPixels(base, layers));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    c = { tex, key, seen: this.frame };
    this.cache.set(pos, c);
    return tex;
  }

  /** Rellena los 6 lados de la caja de la tela (girada según `facing`, relativa a la cámara). */
  private box(d: BannerDraw, camX: number, camY: number, camZ: number): void {
    const [x0, y0, z0, x1, y1, z1] = (d.wall ? WALL : STAND).map((v, i) => v + (i < 3 ? -GROW : GROW));
    // Punto (x, y, z) de la tela en dieciseisavos → mundo, girado como rotateBoxes: (x, z) → (16 - z, x).
    const P = (x: number, y: number, z: number): [number, number, number] => {
      for (let r = 0; r < (d.facing & 3); r++) [x, z] = [16 - z, x];
      return [d.x + x / 16 - camX, d.y + y / 16 - camY, d.z + z / 16 - camZ];
    };
    const Nrm = (nx: number, nz: number): [number, number, number] => {
      for (let r = 0; r < (d.facing & 3); r++) [nx, nz] = [-nz, nx];
      return [nx, 0, nz];
    };
    // Las dos caras grandes llevan el dibujo (u crece hacia -X: de frente se lee de izquierda a derecha;
    // por detrás se ve al revés, como a través de la tela). Los cantos toman la primera columna.
    const u = (x: number) => (x1 - x) / (x1 - x0);
    const v = (y: number) => (y1 - y) / (y1 - y0);
    const edge = 0.5 / BANNER_W;
    // Cada cara: 4 esquinas (x, y, z) en orden y su normal (en el plano, antes de girar).
    const faces: [number[][], [number, number, number], boolean][] = [
      [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], true],
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], true],
      [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], false],
      [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], false],
      [[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], false],
      [[[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], false],
    ];
    let o = 0;
    for (const [pts, n, big] of faces) {
      const nn = n[1] !== 0 ? n : Nrm(n[0], n[2]);
      const quad = [0, 1, 2, 0, 2, 3];
      for (const k of quad) {
        const [px, py, pz] = pts[k];
        this.data.set([...P(px, py, pz), ...nn, big ? u(px) : edge, big ? v(py) : 0.5], o);
        o += FLOATS;
      }
    }
  }

  /** Dibuja las telas (pasada principal). `lightAt`: luz [cielo, bloque] (0..1) de una celda. */
  draw(
    banners: readonly BannerDraw[], camX: number, camY: number, camZ: number,
    lightAt: (x: number, y: number, z: number) => [number, number], bindLighting: (p: Program) => Program,
  ): void {
    const gl = this.gl;
    this.frame++;
    if (banners.length > 0) {
      const p = bindLighting(this.prog.use());
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      for (const d of banners) {
        this.box(d, camX, camY, camZ);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);
        const light = lightAt(d.x + 0.5, d.y + 0.5, d.z + 0.5);
        p.tex2D('uCloth', this.texture(`${d.x},${d.y},${d.z}`, d.base, d.layers)).f2('uLightLevel', light[0], light[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
      }
      gl.bindVertexArray(null);
      gl.enable(gl.CULL_FACE);
    }
    // Olvidar las texturas de estandartes que no se ven hace rato.
    if (this.frame % 300 === 0) {
      for (const [k, c] of this.cache) {
        if (this.frame - c.seen < 600) continue;
        gl.deleteTexture(c.tex);
        this.cache.delete(k);
      }
    }
  }
}
