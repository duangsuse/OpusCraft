// Nubes volumétricas: texturas de ruido 3D generadas en la GPU y pasada de raymarching.
import { Program, RenderTarget, FullscreenTriangle, FULLSCREEN_VS, type GL } from '../engine/gl';
import { CLOUD_SHAPE_GEN_FS, CLOUD_DETAIL_GEN_FS, CLOUD_WEATHER_GEN_FS, CLOUDS_FS } from './shaders/clouds';

export class Clouds {
  private gl: GL;
  private tri: FullscreenTriangle;
  readonly shape: WebGLTexture;
  readonly detail: WebGLTexture;
  readonly weather: WebGLTexture;
  readonly target: RenderTarget;
  private prog: Program;

  constructor(gl: GL, tri: FullscreenTriangle) {
    this.gl = gl;
    this.tri = tri;
    this.shape = this.gen3D(96, CLOUD_SHAPE_GEN_FS, 'cloud-shape');
    this.detail = this.gen3D(32, CLOUD_DETAIL_GEN_FS, 'cloud-detail');
    this.weather = this.gen2D(256, CLOUD_WEATHER_GEN_FS);
    this.target = new RenderTarget(gl, [
      { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR },
    ]);
    this.prog = new Program(gl, { name: 'clouds', vs: FULLSCREEN_VS, fs: CLOUDS_FS });
  }

  private gen3D(size: number, fs: string, name: string): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, size, size, size);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    const prog = new Program(gl, { name, vs: FULLSCREEN_VS, fs });
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    prog.use();
    for (let z = 0; z < size; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
      prog.f1('uZ', (z + 0.5) / size);
      this.tri.draw();
      // Vaciamos la cola a menudo para no disparar el watchdog de la GPU en equipos lentos.
      if ((z & 3) === 3) gl.flush();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(prog.program);
    return tex;
  }

  private gen2D(size: number, fs: string): WebGLTexture {
    const gl = this.gl;
    const rt = new RenderTarget(gl, [
      { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, wrap: gl.REPEAT },
    ]);
    rt.resize(size, size);
    const prog = new Program(gl, { name: 'cloud-weather', vs: FULLSCREEN_VS, fs });
    rt.bind();
    gl.disable(gl.DEPTH_TEST);
    prog.use();
    this.tri.draw();
    gl.deleteProgram(prog.program);
    const tex = rt.color;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return tex;
  }

  resize(w: number, h: number, scale: number): void {
    this.target.resize(Math.ceil(w * scale), Math.ceil(h * scale));
  }

  render(depth: WebGLTexture, skyView: WebGLTexture, irradiance: WebGLTexture, steps: number, temporal: boolean): void {
    const gl = this.gl;
    this.target.bind();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.prog
      .use()
      .tex('uShape', gl.TEXTURE_3D, this.shape)
      .tex('uDetail', gl.TEXTURE_3D, this.detail)
      .tex2D('uWeather', this.weather)
      .tex2D('uDepth', depth)
      .tex2D('uSkyView', skyView)
      .tex2D('uIrradiance', irradiance)
      .f1('uSteps', steps)
      .f1('uTemporal', temporal ? 1 : 0);
    this.tri.draw();
  }
}
