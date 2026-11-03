// Orbes de experiencia: pequeños, emisivos (se ven de noche y el bloom les da el halo), del tamaño
// según su valor, flotando como en Minecraft. Un billboard instanciado por orbe.
import { Program, type GL } from '../engine/gl';
import { XP_ORB_VS, XP_ORB_FS } from './shaders/xpOrb';
import { ENT_XP } from '../../shared/mobs';
import { orbIcon } from '../../shared/experience';
import type { ClientEntity } from '../game/ClientEntities';

const MAX_ORBS = 512;
const FLOATS = 8;

export class XpOrbRenderer {
  private program: Program;
  private data = new Float32Array(MAX_ORBS * FLOATS);
  private buf: WebGLBuffer;
  private vao: WebGLVertexArrayObject;

  constructor(private gl: GL) {
    this.program = new Program(gl, { name: 'xp-orb', vs: XP_ORB_VS, fs: XP_ORB_FS });
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, FLOATS * 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  /** Dibuja los orbes de la lista (en la pasada principal, con escritura de profundidad). */
  draw(ents: readonly ClientEntity[], camX: number, camY: number, camZ: number): void {
    const d = this.data;
    let n = 0;
    for (const e of ents) {
      if (e.type !== ENT_XP || n >= MAX_ORBS) continue;
      const rx = e.x - camX, rz = e.z - camZ;
      if (rx * rx + rz * rz > 64 * 64) continue;
      // Del icono 0 (valor 1-2) al 10 (2477): de 0,2 a 0,45 bloques.
      const size = 0.2 + orbIcon(e.count) * 0.025;
      const bob = Math.sin(e.age * 3 + e.seed * 6.28) * 0.04;
      const o = n * FLOATS;
      d[o] = rx;
      d[o + 1] = e.y + size * 0.5 + 0.08 + bob - camY;
      d[o + 2] = rz;
      d[o + 3] = size;
      d[o + 4] = e.age;
      d[o + 5] = e.seed;
      d[o + 6] = 0;
      d[o + 7] = 0;
      n++;
    }
    if (n === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * FLOATS);
    this.program.use();
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }
}
