// Rayos de las tormentas: una línea quebrada con ramas, de un blanco azulado muy brillante (la
// neblina HDR la hace resplandecer), que parpadea y se apaga en unas décimas de segundo.
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aAlpha;
out float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = /* glsl */ `
in float vAlpha;
out vec4 outColor;
void main() {
  outColor = vec4(vec3(14.0, 15.0, 20.0) * vAlpha, 1.0);
}
`;

export interface Bolt {
  x: number;
  y: number;
  z: number;
  /** Segundos desde que cayó. */
  age: number;
  seed: number;
}

/** Duración de un rayo en pantalla (s). */
export const BOLT_LIFE = 0.45;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return (s & 0xffffff) / 0x1000000;
  };
}

/** Trazado del rayo: tramos [x0, y0, z0, x1, y1, z1, grosor] desde lo alto hasta el suelo. */
function boltPath(b: Bolt): number[][] {
  const r = rng(b.seed);
  const out: number[][] = [];
  const walk = (x: number, y: number, z: number, yEnd: number, width: number, depth: number) => {
    while (y > yEnd) {
      const ny = Math.max(yEnd, y - (2 + r() * 4));
      const nx = x + (r() - 0.5) * 3, nz = z + (r() - 0.5) * 3;
      out.push([x, y, z, nx, ny, nz, width]);
      if (depth < 2 && r() < 0.12) walk(nx, ny, nz, ny - 6 - r() * 10, width * 0.5, depth + 1);
      x = nx;
      y = ny;
      z = nz;
    }
  };
  // Empieza desviado y termina justo en el punto de impacto.
  const top = b.y + 90;
  const sx = b.x + (r() - 0.5) * 12, sz = b.z + (r() - 0.5) * 12;
  walk(sx, top, sz, b.y, 0.35, 0);
  const last = out[out.length - 1];
  if (last) {
    last[3] = b.x;
    last[5] = b.z;
  }
  return out;
}

export class LightningRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cap = 0;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'lightning', vs: VS, fs: FS });
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
  }

  draw(bolts: readonly Bolt[], camX: number, camY: number, camZ: number): void {
    if (bolts.length === 0) return;
    const gl = this.gl;
    const data: number[] = [];
    for (const b of bolts) {
      // Parpadeo: dos o tres destellos que se apagan.
      const t = b.age / BOLT_LIFE;
      const flicker = Math.max(0, 1 - t) * (0.55 + 0.45 * Math.abs(Math.sin(b.age * 55 + b.seed)));
      if (flicker <= 0.01) continue;
      for (const [x0, y0, z0, x1, y1, z1, w] of boltPath(b)) {
        // Cinta orientada hacia la cámara.
        const mx = (x0 + x1) / 2 - camX, my = (y0 + y1) / 2 - camY, mz = (z0 + z1) / 2 - camZ;
        const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
        const l = Math.hypot(sx, sy, sz) || 1;
        sx = (sx / l) * w;
        sy = (sy / l) * w;
        sz = (sz / l) * w;
        const a = [x0 - camX - sx, y0 - camY - sy, z0 - camZ - sz];
        const bb = [x0 - camX + sx, y0 - camY + sy, z0 - camZ + sz];
        const c = [x1 - camX + sx, y1 - camY + sy, z1 - camZ + sz];
        const d = [x1 - camX - sx, y1 - camY - sy, z1 - camZ - sz];
        for (const v of [a, bb, c, a, c, d]) data.push(v[0], v[1], v[2], flicker);
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
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, arr.length / 4);
    gl.depthMask(true);
    if (!blend) gl.disable(gl.BLEND);
    if (cull) gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
