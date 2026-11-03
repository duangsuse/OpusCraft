// Sistema de partículas del cliente: hasta 16 384 a la vez, guardadas en arrays tipados (una columna
// por propiedad) para no crear objetos cada frame. Cada partícula tiene su física (gravedad,
// rozamiento, viento, balanceo de hojas y pétalos, giro, choque con los bloques, rebote o reposo en el
// suelo), un color y tamaño que cambian con la edad y un sprite del atlas procedural (o un trozo de
// la textura de un bloque). Se dibujan ordenadas de atrás adelante en un solo pase.
import { Program, type GL } from '../../engine/gl';
import { PARTICLE2_VS, PARTICLE2_FS } from '../shaders/particles';
import { generateParticleAtlas, ATLAS, SPRITE } from './atlas';

export { SPRITE };

/** Banderas de cada partícula. */
export const PF = {
  /** Brilla por sí misma (se suma a la escena). */
  EMISSIVE: 1,
  /** Trozo de la textura de un bloque. */
  BLOCK: 2,
  /** Se estira en la dirección de su velocidad. */
  STRETCH: 4,
  /** Choca con los bloques. */
  COLLIDE: 8,
  /** Se mece al caer (hojas, pétalos, copos). */
  FLUTTER: 16,
  /** Al tocar el suelo se queda quieta un rato y se desvanece. */
  REST: 32,
  /** Al tocar el suelo o el agua salpica y desaparece. */
  SPLASH: 64,
  /** Rebota al tocar el suelo. */
  BOUNCE: 128,
  /** Burbuja: sube y revienta al salir del agua. */
  BUBBLE: 256,
  /** Aparece poco a poco (si no, desde el primer instante). */
  FADE_IN: 512,
  /** Parpadea (luciérnagas). */
  BLINK: 1024,
  /** Gota que cuelga antes de caer. */
  HANG: 2048,
  /** Flota sin rumbo (esporas, motas bajo el agua). */
  DRIFT: 4096,
  /** Iluminada siempre a plena luz (corazones): no se vuelve a medir la luz del sitio. */
  BRIGHT: 8192,
} as const;

export interface Spawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Tamaño al final de su vida (por defecto, el mismo). */
  size1?: number;
  sprite: number;
  /** Fotogramas de animación consecutivos en el atlas (a 12 por segundo). */
  frames?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  /** Color al final de su vida (por defecto, el mismo). */
  r1?: number;
  g1?: number;
  b1?: number;
  grav?: number;
  drag?: number;
  wind?: number;
  rot?: number;
  spin?: number;
  flags?: number;
  /** Luz empaquetada (cielo · 16 + bloque); si falta, se mide en el sitio. */
  light?: number;
  /** Trozo de bloque: uv (0..15). */
  uv?: number;
}

/** Lo que el sistema necesita saber del mundo. */
export interface ParticleWorld {
  solid(x: number, y: number, z: number): boolean;
  /** 0 aire, 1 agua, 2 lava. */
  fluid(x: number, y: number, z: number): number;
  /** Luz empaquetada (cielo · 16 + bloque). */
  light(x: number, y: number, z: number): number;
}

const CAP = 16384;
const STRIDE = 16;

export class ParticleSystem {
  private gl: GL;
  private prog: Program;
  private atlas: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private inst = new Float32Array(CAP * STRIDE);
  private order = new Uint32Array(CAP);
  private keys = new Float32Array(CAP);
  n = 0;
  // Columnas.
  private x = new Float32Array(CAP);
  private y = new Float32Array(CAP);
  private z = new Float32Array(CAP);
  private vx = new Float32Array(CAP);
  private vy = new Float32Array(CAP);
  private vz = new Float32Array(CAP);
  private age = new Float32Array(CAP);
  private life = new Float32Array(CAP);
  private s0 = new Float32Array(CAP);
  private s1 = new Float32Array(CAP);
  private rot = new Float32Array(CAP);
  private spin = new Float32Array(CAP);
  private cr = new Float32Array(CAP);
  private cg = new Float32Array(CAP);
  private cb = new Float32Array(CAP);
  private ca = new Float32Array(CAP);
  private er = new Float32Array(CAP);
  private eg = new Float32Array(CAP);
  private eb = new Float32Array(CAP);
  private sprite = new Float32Array(CAP);
  private frames = new Uint8Array(CAP);
  private flags = new Uint16Array(CAP);
  private grav = new Float32Array(CAP);
  private drag = new Float32Array(CAP);
  private wind = new Float32Array(CAP);
  private light = new Float32Array(CAP);
  private uv = new Float32Array(CAP);
  private rest = new Float32Array(CAP);
  private seed = new Float32Array(CAP);
  private lightT = 0;
  /** Viento del momento (bloques/s), igual para todas. */
  windX = 0.6;
  windZ = 0.25;
  private time = 0;
  /** Mundo (lo pone el juego); sin él, las partículas no chocan ni miden la luz. */
  world: ParticleWorld | null = null;

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'particles', vs: PARTICLE2_VS, fs: PARTICLE2_FS });
    this.atlas = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, generateParticleAtlas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
  }

  /** Crea una partícula (si no cabe, se ignora). */
  spawn(o: Spawn): void {
    if (this.n >= CAP) return;
    const i = this.n++;
    this.x[i] = o.x;
    this.y[i] = o.y;
    this.z[i] = o.z;
    this.vx[i] = o.vx ?? 0;
    this.vy[i] = o.vy ?? 0;
    this.vz[i] = o.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = Math.max(0.02, o.life);
    this.s0[i] = o.size;
    this.s1[i] = o.size1 ?? o.size;
    this.rot[i] = o.rot ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.cr[i] = o.r ?? 1;
    this.cg[i] = o.g ?? 1;
    this.cb[i] = o.b ?? 1;
    this.ca[i] = o.a ?? 1;
    this.er[i] = o.r1 ?? this.cr[i];
    this.eg[i] = o.g1 ?? this.cg[i];
    this.eb[i] = o.b1 ?? this.cb[i];
    this.sprite[i] = o.sprite;
    this.frames[i] = o.frames ?? 1;
    this.flags[i] = o.flags ?? 0;
    this.grav[i] = o.grav ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.wind[i] = o.wind ?? 0;
    this.uv[i] = o.uv ?? 0;
    this.rest[i] = 0;
    this.seed[i] = Math.random() * 100;
    this.light[i] = o.light ?? (this.world ? this.world.light(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)) : 0xf0);
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    // Mover la última al hueco.
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.rot[i] = this.rot[j]; this.spin[i] = this.spin[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j]; this.ca[i] = this.ca[j];
    this.er[i] = this.er[j]; this.eg[i] = this.eg[j]; this.eb[i] = this.eb[j];
    this.sprite[i] = this.sprite[j]; this.frames[i] = this.frames[j]; this.flags[i] = this.flags[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.wind[i] = this.wind[j];
    this.light[i] = this.light[j]; this.uv[i] = this.uv[j]; this.rest[i] = this.rest[j]; this.seed[i] = this.seed[j];
  }

  clear(): void {
    this.n = 0;
  }

  // ------------------------------------------------------------------ simulación

  update(dt: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const w = this.world;
    // Rachas de viento suaves.
    const t = this.time;
    this.windX = 0.55 + Math.sin(t * 0.13) * 0.35 + Math.sin(t * 0.71) * 0.15;
    this.windZ = 0.2 + Math.cos(t * 0.09) * 0.3 + Math.sin(t * 0.53) * 0.12;
    this.lightT -= dt;
    const relight = this.lightT <= 0;
    if (relight) this.lightT = 0.25;
    for (let i = this.n - 1; i >= 0; i--) {
      const f = this.flags[i];
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      if (this.rest[i] > 0) {
        this.rest[i] += dt;
        continue;
      }
      if (f & PF.HANG && this.age[i] < this.life[i] * 0.35) {
        // La gota se va formando colgada antes de soltarse.
        continue;
      }
      let vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      vy -= this.grav[i] * dt;
      const k = Math.exp(-this.drag[i] * dt);
      vx *= k;
      vy *= k;
      vz *= k;
      const wf = this.wind[i];
      if (wf) {
        vx += (this.windX * wf - vx) * Math.min(1, dt * 0.8);
        vz += (this.windZ * wf - vz) * Math.min(1, dt * 0.8);
      }
      let dx = vx * dt, dy = vy * dt, dz = vz * dt;
      if (f & PF.FLUTTER) {
        // Balanceo: una hoja cae meciéndose de lado a lado.
        const ph = this.age[i] * 2.4 + this.seed[i];
        dx += Math.cos(ph) * 0.9 * dt;
        dz += Math.sin(ph * 0.8) * 0.9 * dt;
        this.rot[i] = Math.sin(ph) * 0.9 + this.spin[i] * this.age[i] * 0.3;
      } else this.rot[i] += this.spin[i] * dt;
      if (f & PF.DRIFT) {
        const ph = this.age[i] * 0.9 + this.seed[i];
        dx += Math.sin(ph * 1.3) * 0.25 * dt;
        dy += Math.sin(ph * 0.7 + 1) * 0.18 * dt;
        dz += Math.cos(ph * 1.1) * 0.25 * dt;
      }
      let nx = this.x[i] + dx, ny = this.y[i] + dy, nz = this.z[i] + dz;
      if (w && f & (PF.COLLIDE | PF.BUBBLE | PF.SPLASH)) {
        const bx = Math.floor(nx), by = Math.floor(ny), bz = Math.floor(nz);
        if (f & PF.BUBBLE) {
          if (w.fluid(bx, by, bz) !== 1) {
            this.kill(i);
            continue;
          }
        }
        if (f & PF.SPLASH && vy < 0 && (w.solid(bx, by, bz) || w.fluid(bx, by, bz) !== 0)) {
          const lava = w.fluid(bx, by, bz) === 2;
          this.splashAt(nx, lava || w.fluid(bx, by, bz) ? by + 0.9 : by + 1.02, nz, this.cr[i], this.cg[i], this.cb[i], (f & PF.EMISSIVE) !== 0);
          void lava;
          this.kill(i);
          continue;
        }
        if (f & PF.COLLIDE) {
          if (w.solid(Math.floor(nx), Math.floor(this.y[i]), Math.floor(this.z[i]))) {
            nx = this.x[i];
            vx = -vx * 0.3;
          }
          if (w.solid(Math.floor(nx), Math.floor(this.y[i]), Math.floor(nz))) {
            nz = this.z[i];
            vz = -vz * 0.3;
          }
          if (w.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
            if (vy < 0) {
              if (f & PF.REST) {
                // Se posa en el suelo: queda quieta y se desvanece en unos segundos.
                this.x[i] = nx;
                this.z[i] = nz;
                this.y[i] = Math.floor(ny) + 1.02;
                this.vx[i] = this.vy[i] = this.vz[i] = 0;
                this.rest[i] = 1e-3;
                this.life[i] = Math.min(this.life[i], this.age[i] + 2.5 + Math.random() * 2);
                continue;
              }
              if (f & PF.BOUNCE && vy < -2) {
                vy = -vy * 0.3;
                vx *= 0.6;
                vz *= 0.6;
              } else {
                vy = 0;
                vx *= 0.5;
                vz *= 0.5;
              }
            } else vy = 0;
            ny = this.y[i];
          }
        }
      }
      this.x[i] = nx;
      this.y[i] = ny;
      this.z[i] = nz;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      if (relight && w && !(f & (PF.EMISSIVE | PF.BRIGHT))) this.light[i] = w.light(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    }
  }

  /** Salpicadura pequeña (gota que cae al suelo o al agua). */
  private splashAt(x: number, y: number, z: number, r: number, g: number, b: number, emissive: boolean): void {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
      this.spawn({
        x, y, z, vx: Math.cos(a) * s, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * s, life: 0.25 + Math.random() * 0.25,
        size: 0.035 + Math.random() * 0.025, sprite: SPRITE.spark, r, g, b, a: 0.9, grav: 22, flags: PF.STRETCH | (emissive ? PF.EMISSIVE : 0),
      });
    }
  }

  // ------------------------------------------------------------------ dibujo

  /**
   * Dibuja las partículas sobre el color de la escena ya compuesto. `depth`: profundidad de la
   * escena (no debe estar enganchada al framebuffer de destino): oclusión y fundido suave.
   */
  draw(camX: number, camY: number, camZ: number, albedo: WebGLTexture, irradiance: WebGLTexture, depth: WebGLTexture): void {
    const n = this.n;
    if (n === 0) return;
    const gl = this.gl;
    // Orden de atrás adelante (para que las iluminadas se mezclen bien).
    for (let i = 0; i < n; i++) {
      const dx = this.x[i] - camX, dy = this.y[i] - camY, dz = this.z[i] - camZ;
      this.keys[i] = dx * dx + dy * dy + dz * dz;
      this.order[i] = i;
    }
    const keys = this.keys;
    const ord = this.order.subarray(0, n);
    ord.sort((a, b) => keys[b] - keys[a]);
    const d = this.inst;
    let m = 0;
    for (let k = 0; k < n; k++) {
      const i = ord[k];
      if (keys[i] > 160 * 160) continue;
      const t = this.age[i] / this.life[i];
      const f = this.flags[i];
      // Opacidad: aparece (si se pide), se mantiene y se apaga en el último 30 %.
      let a = this.ca[i];
      if (f & PF.FADE_IN) a *= Math.min(1, t / 0.15);
      a *= t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      if (f & PF.BLINK) a *= 0.35 + 0.65 * Math.max(0, Math.sin(this.age[i] * 2.3 + this.seed[i]) * 1.4);
      if (a <= 0.002) continue;
      let size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      if (f & PF.HANG && this.age[i] < this.life[i] * 0.35) size *= 0.4 + 0.6 * (this.age[i] / (this.life[i] * 0.35));
      let sprite = this.sprite[i];
      if (this.frames[i] > 1) sprite += Math.floor(this.age[i] * 12 + this.seed[i]) % this.frames[i];
      const o = m * STRIDE;
      d[o] = this.x[i] - camX;
      d[o + 1] = this.y[i] - camY;
      d[o + 2] = this.z[i] - camZ;
      d[o + 3] = size;
      d[o + 4] = this.cr[i] + (this.er[i] - this.cr[i]) * t;
      d[o + 5] = this.cg[i] + (this.eg[i] - this.cg[i]) * t;
      d[o + 6] = this.cb[i] + (this.eb[i] - this.cb[i]) * t;
      d[o + 7] = a;
      d[o + 8] = sprite;
      d[o + 9] = this.rot[i];
      d[o + 10] = f & PF.EMISSIVE ? 0xff : this.light[i];
      d[o + 11] = f & (PF.EMISSIVE | PF.BLOCK | PF.STRETCH);
      d[o + 12] = this.vx[i];
      d[o + 13] = this.vy[i];
      d[o + 14] = this.vz[i];
      d[o + 15] = this.uv[i];
      m++;
    }
    if (m === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, m * STRIDE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Sin prueba de profundidad del hardware: el sombreador compara con la de la escena.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.prog.use()
      .tex2D('uAtlas', this.atlas)
      .tex('uAlbedo', gl.TEXTURE_2D_ARRAY, albedo)
      .tex2D('uIrradiance', irradiance)
      .tex2D('uDepth', depth);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
