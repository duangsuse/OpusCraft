// Fase 8.6 (el End): efectos de luz del combate con el dragón, en una pasada aditiva (como el haz del faro).
// - Rayos de la muerte del dragón (EnderDragonRenderer.renderRays): abanicos de luz que salen de su pecho, blancos en
//   el centro y morados y transparentes en la punta, cada vez más y más largos; al final se apagan. Por encima de Java:
//   brillan por encima de 1 (la floración les da halo) y titilan.
// - Haz del cristal (renderCrystalBeams): de cada cristal al dragón que cura (o a donde apunte en la reaparición), un
//   tubo en espiral que se ensancha hacia el destino, con bandas que corren.
import { Program, type GL } from '../engine/gl';
import { COMMON } from './shaders/common';
import { mulberry32 } from '../../shared/world/noise';

const VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec2 aUv;
out vec4 vColor;
out vec2 vUv;
void main() {
  vColor = aColor;
  vUv = aUv;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS = /* glsl */ `
${COMMON}
in vec4 vColor;
in vec2 vUv;
out vec4 outColor;
void main() {
  // vUv.y < 0: rayo liso; si no, haz: vUv.x alrededor del tubo y vUv.y a lo largo (con bandas que corren).
  float k = 1.0;
  if (vUv.y >= 0.0) {
    float t = uCamPos.w;
    float edge = 1.0 - pow(abs(fract(vUv.x) * 2.0 - 1.0), 2.0);
    k = edge * (0.55 + 0.45 * sin(vUv.y * 2.2 - t * 6.0) * sin(vUv.x * 12.566 + t * 2.0));
  }
  outColor = vec4(vColor.rgb * k, vColor.a * k);
}
`;

export interface CrystalBeam {
  from: [number, number, number];
  to: [number, number, number];
}

export interface DragonRays {
  x: number;
  y: number;
  z: number;
  /** yRot de Java y ticks de muerte (0..200). */
  yRot: number;
  death: number;
}

const HALF_SQRT_3 = Math.sqrt(3) / 2;

export class EndFxRenderer {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private cap = 0;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'end-fx', vs: VS, fs: FS });
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
    gl.bindVertexArray(null);
  }

  draw(rays: readonly DragonRays[], beams: readonly CrystalBeam[], camX: number, camY: number, camZ: number, time: number): void {
    if (rays.length === 0 && beams.length === 0) return;
    const data: number[] = [];
    const v = (x: number, y: number, z: number, r: number, g: number, b: number, a: number, u = 0, w = -1) => data.push(x - camX, y - camY, z - camZ, r, g, b, a, u, w);
    for (const d of rays) this.rays(d, time, v);
    for (const b of beams) this.beam(b, time, v);
    if (data.length === 0) return;
    const gl = this.gl;
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

  /** renderRays: el abanico de rayos (con el mismo azar de Java: semilla fija, así cada muerte se ve igual). */
  private rays(d: DragonRays, time: number, v: (x: number, y: number, z: number, r: number, g: number, b: number, a: number, u?: number, w?: number) => void): void {
    const t = Math.min(1, d.death / 200);
    const fade = Math.min(t > 0.8 ? (t - 0.8) / 0.2 : 0, 1);
    const n = Math.floor(((t + t * t) / 2) * 60);
    if (n <= 0) return;
    const r = mulberry32(432);
    // Centro del pecho: 1 más abajo y 2 atrás de la posición (en el marco girado del dragón), como en Java.
    const yr = -d.yRot * (Math.PI / 180);
    const ox = d.x + Math.sin(yr) * 2, oy = d.y + 1, oz = d.z + Math.cos(yr) * 2;
    const core = (1 - fade) * 1.5;
    for (let i = 0; i < n; i++) {
      const ax = r() * Math.PI * 2, ay = r() * Math.PI * 2, az = r() * Math.PI * 2;
      const bx = r() * Math.PI * 2, by = r() * Math.PI * 2, bz = r() * Math.PI * 2 + t * (Math.PI / 2) + time * 0.05;
      const len = r() * 20 + 5 + fade * 10;
      const wid = r() * 2 + 1 + fade * 2;
      const rot = (p: [number, number, number]): [number, number, number] => rotXYZ(rotXYZ(p, bx, by, bz), ax, ay, az);
      const p2 = rot([-HALF_SQRT_3 * wid, len, -0.5 * wid]);
      const p3 = rot([HALF_SQRT_3 * wid, len, -0.5 * wid]);
      const p4 = rot([0, len, wid]);
      const flick = 0.85 + 0.15 * Math.sin(time * 9 + i * 1.7);
      const c = core * flick;
      for (const [a, b] of [[p2, p3], [p3, p4], [p4, p2]] as const) {
        v(ox, oy, oz, c, c * 0.85, c, 1);
        v(ox + a[0], oy + a[1], oz + a[2], 1, 0, 1, 0);
        v(ox + b[0], oy + b[1], oz + b[2], 1, 0, 1, 0);
      }
    }
  }

  /** El haz del cristal: ocho caras de 0,2 a 0,75 de radio (más un núcleo fino) con bandas que corren hacia el destino. */
  private beam(b: CrystalBeam, time: number, v: (x: number, y: number, z: number, r: number, g: number, b: number, a: number, u?: number, w?: number) => void): void {
    const [x0, y0, z0] = b.from, [x1, y1, z1] = b.to;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    // Base ortonormal alrededor del eje.
    const ax = dx / len, ay = dy / len, az = dz / len;
    let ux = -az, uy = 0, uz = ax;
    if (Math.hypot(ux, uz) < 1e-3) [ux, uy, uz] = [1, 0, 0];
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux;
    const spin = time * 0.8;
    for (const [r0, r1, bright] of [[0.2, 0.75, 1.1], [0.06, 0.2, 2.6]] as const) {
      for (let i = 0; i < 8; i++) {
        const a0 = spin + (i / 8) * Math.PI * 2, a1 = spin + ((i + 1) / 8) * Math.PI * 2;
        const pt = (a: number, rad: number, s: number): [number, number, number] => [
          x0 + dx * s + (ux * Math.cos(a) + wx * Math.sin(a)) * rad,
          y0 + dy * s + (uy * Math.cos(a) + wy * Math.sin(a)) * rad,
          z0 + dz * s + (uz * Math.cos(a) + wz * Math.sin(a)) * rad,
        ];
        const A = pt(a0, r0, 0), B = pt(a1, r0, 0), C = pt(a1, r1, 1), D = pt(a0, r1, 1);
        const col = (p: [number, number, number], u: number, s: number) => v(p[0], p[1], p[2], 1.0 * bright, 0.55 * bright, 1.0 * bright, 0.85, u, s * len);
        col(A, 0, 0); col(B, 1, 0); col(C, 1, 1);
        col(A, 0, 0); col(C, 1, 1); col(D, 0, 1);
      }
    }
  }
}

/** Rota un punto por X, luego Y, luego Z (Quaternionf.rotationXYZ). */
function rotXYZ(p: [number, number, number], ax: number, ay: number, az: number): [number, number, number] {
  let [x, y, z] = p;
  // rotationXYZ aplica primero Z, luego Y, luego X a un vector (q = qx * qy * qz).
  let c = Math.cos(az), s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(ax); s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
