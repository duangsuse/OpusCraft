// Fase 7.5 (océano): el rayo de los guardianes. Una cinta orientada hacia la cámara del ojo a la presa,
// con bandas que corren hacia ella y el color de Minecraft: de violeta oscuro a amarillo claro a medida
// que se carga (y más brillante al final).
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor;
out vec2 vUv;
out vec4 vColor;
void main() {
  vUv = aUv;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = /* glsl */ `
${COMMON}
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  // Bandas que avanzan hacia la presa y bordes suaves.
  float band = 0.55 + 0.45 * sin(vUv.x * 5.0 - uCamPos.w * 9.0);
  float edge = 1.0 - vUv.y * vUv.y;
  outColor = vec4(vColor.rgb * (0.6 + band) * 2.2, vColor.a * edge);
}
`;

export interface GuardianBeam {
  from: [number, number, number];
  to: [number, number, number];
  /** Carga 0..1 (color). */
  charge: number;
  /** Medio grosor (bloques). */
  width: number;
}

/** Color del rayo según la carga (fórmula de Minecraft). */
export function beamColor(charge: number): [number, number, number] {
  const f = charge * charge;
  return [(64 + f * 191) / 255, (32 + f * 191) / 255, (128 - f * 64) / 255];
}

export class GuardianBeamRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cap = 0;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'guardian-beam', vs: VS, fs: FS });
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    gl.bindVertexArray(null);
  }

  draw(beams: readonly GuardianBeam[], camX: number, camY: number, camZ: number): void {
    if (beams.length === 0) return;
    const gl = this.gl;
    const data: number[] = [];
    for (const b of beams) {
      const [x0, y0, z0] = [b.from[0] - camX, b.from[1] - camY, b.from[2] - camZ];
      const [x1, y1, z1] = [b.to[0] - camX, b.to[1] - camY, b.to[2] - camZ];
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.1) continue;
      // Lado perpendicular a la dirección y a la vista (desde el punto medio).
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
      let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
      const l = Math.hypot(sx, sy, sz) || 1;
      sx = (sx / l) * b.width;
      sy = (sy / l) * b.width;
      sz = (sz / l) * b.width;
      const [r, g, bl] = beamColor(b.charge);
      const a = 0.55 + 0.45 * b.charge;
      const v = (x: number, y: number, z: number, u: number, s: number) => data.push(x, y, z, u, s, r, g, bl, a);
      const A = () => v(x0 - sx, y0 - sy, z0 - sz, 0, -1), B = () => v(x0 + sx, y0 + sy, z0 + sz, 0, 1);
      const C = () => v(x1 + sx, y1 + sy, z1 + sz, len, 1), D = () => v(x1 - sx, y1 - sy, z1 - sz, len, -1);
      A(); B(); C(); A(); C(); D();
    }
    if (data.length === 0) return;
    const arr = new Float32Array(data);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (arr.byteLength > this.cap) {
      this.cap = arr.byteLength * 2;
      gl.bufferData(gl.ARRAY_BUFFER, this.cap, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    const cull = gl.isEnabled(gl.CULL_FACE), blend = gl.isEnabled(gl.BLEND);
    this.prog.use();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, arr.length / 9);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!blend) gl.disable(gl.BLEND);
    if (cull) gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
