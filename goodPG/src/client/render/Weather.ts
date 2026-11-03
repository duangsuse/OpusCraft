// Renderizado de la precipitación (lluvia/nieve) y mapa de alturas para que no llueva bajo techo.
import { Program, type GL } from '../engine/gl';
import { RAIN_VS, RAIN_FS } from './shaders/weather';

const DROPS = 9000;
const BOX = [36, 28, 36];

export class Weather {
  private gl: GL;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  readonly heightTex: WebGLTexture;
  private origin: [number, number] = [0, 0];

  constructor(gl: GL) {
    this.gl = gl;
    this.prog = new Program(gl, { name: 'rain', vs: RAIN_VS, fs: RAIN_FS });
    const seeds = new Float32Array(DROPS * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    this.heightTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    // Alturas del mundo tal cual (pueden ser negativas o pasar de 255).
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 64, 64, 0, gl.RED, gl.FLOAT, new Float32Array(64 * 64).fill(-1e4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /** Alturas (bloque sólido más alto) de un área de 64x64 con esquina en (x0, z0). */
  setHeights(x0: number, z0: number, heights: Float32Array): void {
    const gl = this.gl;
    this.origin = [x0, z0];
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 64, gl.RED, gl.FLOAT, heights);
  }

  draw(camX: number, camY: number, camZ: number, intensity: number, snow: boolean, time: number, irradiance: WebGLTexture): void {
    if (intensity <= 0.01) return;
    const gl = this.gl;
    const m = (v: number, b: number) => ((v % b) + b) % b;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    this.prog.use()
      .f1('uIntensity', intensity)
      .f1('uSnow', snow ? 1 : 0)
      .f3('uCamFrac', m(camX, BOX[0]), m(camY, BOX[1]), m(camZ, BOX[2]))
      .f2('uRainOrigin', this.origin[0], this.origin[1])
      .f1('uTime', time % 10000)
      .tex2D('uRainHeight', this.heightTex)
      .tex2D('uIrradiance', irradiance);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, DROPS);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }
}
