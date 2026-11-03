// Texto de los carteles: cada cartel con texto es un quad pegado a la cara del tablero, con una
// textura de su texto (4 líneas en negro) dibujada en un canvas y cacheada mientras no cambie.
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uViewProj * vec4(aPos, 1.0);
  // Un poco hacia la cámara: pegado al tablero, la profundidad no distingue a varios metros.
  gl_Position.z -= 0.0004 * gl_Position.w;
}
`;

const FS = /* glsl */ `
uniform sampler2D uText;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec4 t = texture(uText, vUV);
  if (t.a < 0.5) discard;
  outColor = vec4(t.rgb, 1.0);
}
`;

export interface SignDraw {
  x: number;
  y: number;
  z: number;
  /** Hacia dónde mira el texto (0 N, 1 E, 2 S, 3 O). */
  facing: number;
  /** En la pared (tablero más bajo y pegado al fondo) o de pie. */
  wall: boolean;
  /** Cartel colgante: 0 no, 1 del techo, 2 de pared (texto por las dos caras). */
  hanging?: number;
  lines: readonly string[];
}

interface Cached {
  tex: WebGLTexture;
  text: string;
  seen: number;
}

const TEX_W = 128, TEX_H = 64;

export class SignTextRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cache = new Map<string, Cached>();
  private canvas = document.createElement('canvas');
  private frame = 0;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'sign-text', vs: VS, fs: FS });
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
  }

  /** Textura con el texto (se rehace sólo si cambia). */
  private texture(key: string, lines: readonly string[]): WebGLTexture {
    const gl = this.gl;
    const text = lines.join('\n');
    let c = this.cache.get(key);
    if (c && c.text === text) {
      c.seen = this.frame;
      return c.tex;
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px "Courier New", monospace';
    lines.forEach((l, i) => ctx.fillText(l, TEX_W / 2, 8 + i * 16, TEX_W - 4));
    const tex = c?.tex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    c = { tex, text, seen: this.frame };
    this.cache.set(key, c);
    return tex;
  }

  /** Dibuja los carteles (pasada principal, con prueba de profundidad). */
  draw(signs: readonly SignDraw[], camX: number, camY: number, camZ: number): void {
    const gl = this.gl;
    this.frame++;
    if (signs.length > 0) {
      const p = this.prog.use();
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      const data = new Float32Array(20);
      for (const s of signs) {
        // Esquinas del texto en dieciseisavos (mirando al norte): de pie el tablero va de y 8 a 16 con
        // la cara en z = 7; en la pared, de y 4 a 12 con la cara en z = 14. Visto de frente, x baja.
        // Colgantes: tablero de y 0 a 10 con caras en z = 7 y z = 9 (el de pared, girado 90°: sus caras
        // miran a los lados de la pared); el texto va por las dos caras.
        const hanging = s.hanging ?? 0;
        const faces: [number, number, number, number][] = hanging
          ? [[9.4, 1.2, 6.92, 0], [9.4, 1.2, 9.08, 1]]
          : [[...(s.wall ? [11.6, 4.4, 13.92] : [15.6, 8.4, 6.92]), 0] as [number, number, number, number]];
        const facing = hanging === 2 ? s.facing + 1 : s.facing;
        const tex = this.texture(`${s.x},${s.y},${s.z}`, s.lines);
        for (const [top, bottom, face, back] of faces) {
          // Por detrás, x crece (se lee bien desde el otro lado).
          const pts = back ? [[1, top], [15, top], [15, bottom], [1, bottom]] : [[15, top], [1, top], [1, bottom], [15, bottom]];
          const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
          for (let k = 0; k < 4; k++) {
            let x = pts[k][0], z = face;
            for (let r = 0; r < (facing & 3); r++) [x, z] = [16 - z, x];
            data.set([s.x + x / 16 - camX, s.y + pts[k][1] / 16 - camY, s.z + z / 16 - camZ, uv[k][0], uv[k][1]], k * 5);
          }
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
          p.tex2D('uText', tex);
          gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        }
      }
      gl.bindVertexArray(null);
      gl.enable(gl.CULL_FACE);
    }
    // Olvidar las texturas de carteles que no se ven hace rato.
    if (this.frame % 300 === 0) {
      for (const [k, c] of this.cache) {
        if (this.frame - c.seen < 600) continue;
        gl.deleteTexture(c.tex);
        this.cache.delete(k);
      }
    }
  }
}
