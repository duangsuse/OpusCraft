// Fase 8.5 (lo que da el Nether): el haz del faro. Como en Java, un prisma interior que gira despacio con bandas que
// suben y una funda exterior más ancha y tenue, del color de cada tramo (los cristales de color lo tiñen). Por
// encima de Java: brilla por encima de 1 (la floración lo recoge y hace el halo), las bandas tienen dos ritmos y el
// haz se desvanece hacia arriba en vez de cortarse; al encenderse, sube desde el faro.
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';
import type { BeaconBeam } from '../game/beacons';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aUv;
layout(location = 2) in vec4 aColor;
out vec3 vUv;
out vec4 vColor;
void main() {
  vUv = aUv;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = /* glsl */ `
${COMMON}
in vec3 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  // vUv.x: alrededor del prisma (0..1 en cada cara); vUv.y: altura en bloques; vUv.z: 0 interior, 1 funda.
  float t = uCamPos.w;
  float h = vUv.y;
  float bands = 0.6 + 0.25 * sin(h * 1.7 - t * 3.2) + 0.15 * sin(h * 0.45 - t * 1.1 + vUv.x * 6.2831);
  float edge = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 3.0);
  // Se apaga hacia arriba (a lo lejos) y casi no se ve de la cara en el primer bloque.
  float fade = clamp(1.0 - h / 260.0, 0.0, 1.0);
  float base = smoothstep(0.0, 0.6, h);
  float inner = 1.0 - vUv.z;
  float a = vColor.a * edge * fade * base * mix(0.22, 0.8, inner);
  // El color del tramo, saturado (sin quemarse a blanco) y algo por encima de 1 en el centro para la floración.
  vec3 c = vColor.rgb * vColor.rgb * mix(0.9, 1.7, inner * edge) * bands;
  outColor = vec4(c, a);
}
`;

export class BeaconBeamRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cap = 0;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'beacon-beam', vs: VS, fs: FS });
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    gl.bindVertexArray(null);
  }

  draw(beams: readonly BeaconBeam[], camX: number, camY: number, camZ: number, time: number): void {
    if (beams.length === 0) return;
    const gl = this.gl;
    const data: number[] = [];
    for (const b of beams) {
      const cx = b.x + 0.5 - camX, cz = b.z + 0.5 - camZ;
      // Al encenderse, el haz sube 60 bloques por segundo.
      const reach = b.y + 1 + Math.max(0, b.age) * 60;
      for (const shell of [0, 1]) {
        const r = shell ? 0.25 : 0.2;
        const spin = shell ? -time * 0.25 : time * 0.6;
        for (const seg of b.segments) {
          const y0 = seg.y0, y1 = Math.min(seg.y1, reach);
          if (y1 <= y0) continue;
          const [cr, cg, cb] = seg.color;
          const alpha = shell ? 0.5 : 0.95;
          for (let f = 0; f < 4; f++) {
            const a0 = spin + (f * Math.PI) / 2, a1 = a0 + Math.PI / 2;
            const x0 = cx + Math.cos(a0) * r * Math.SQRT2, z0 = cz + Math.sin(a0) * r * Math.SQRT2;
            const x1 = cx + Math.cos(a1) * r * Math.SQRT2, z1 = cz + Math.sin(a1) * r * Math.SQRT2;
            const ya = y0 - camY, yb = y1 - camY;
            const v = (x: number, y: number, z: number, u: number, h: number) => data.push(x, y, z, u, h, shell, cr, cg, cb, alpha);
            v(x0, ya, z0, 0, y0 - b.y); v(x1, ya, z1, 1, y0 - b.y); v(x1, yb, z1, 1, y1 - b.y);
            v(x0, ya, z0, 0, y0 - b.y); v(x1, yb, z1, 1, y1 - b.y); v(x0, yb, z0, 0, y1 - b.y);
          }
        }
      }
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
    gl.drawArrays(gl.TRIANGLES, 0, arr.length / 10);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!blend) gl.disable(gl.BLEND);
    if (cull) gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
