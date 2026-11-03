// Gestión de las LUT del cielo físico y cálculo en CPU de la luz directa del sol/luna.
import { Program, RenderTarget, FullscreenTriangle, FULLSCREEN_VS, FULLSCREEN_FAR_VS, type GL } from '../engine/gl';
import { TRANSMITTANCE_FS, MULTISCAT_FS, SKYVIEW_FS, IRRADIANCE_FS, SKY_FS } from './shaders/atmosphere';

const RG = 6360;
const RT = 6460;
const RAY_SCAT = [5.802e-3, 13.558e-3, 33.1e-3];
const MIE_EXT = 4.44e-3;
const OZONE = [0.65e-3, 1.881e-3, 0.085e-3];

/** Iluminancia solar fuera de la atmósfera (unidades arbitrarias de la escena). */
export const SUN_ILLUMINANCE: [number, number, number] = [9.6, 9.35, 9.0];

const f16 = (gl: GL) => ({ internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR });

export class Atmosphere {
  private gl: GL;
  private tri: FullscreenTriangle;
  readonly transmittance: RenderTarget;
  readonly multiScat: RenderTarget;
  readonly skyView: RenderTarget;
  readonly irradiance: RenderTarget;
  private pTrans: Program;
  private pMulti: Program;
  private pSkyView: Program;
  private pIrr: Program;
  readonly pSky: Program;
  /** 64 direcciones: fracción de océano más allá de la distancia de renderizado. */
  readonly farOcean: WebGLTexture;

  constructor(gl: GL, tri: FullscreenTriangle) {
    this.gl = gl;
    this.tri = tri;
    this.farOcean = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.farOcean);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(64).fill(255));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.transmittance = new RenderTarget(gl, [f16(gl)]);
    this.transmittance.resize(256, 64);
    this.multiScat = new RenderTarget(gl, [f16(gl)]);
    this.multiScat.resize(32, 32);
    this.skyView = new RenderTarget(gl, [{ ...f16(gl), wrap: gl.CLAMP_TO_EDGE }]);
    this.skyView.resize(192, 108);
    // La LUT de vista del cielo se repite en azimut.
    gl.bindTexture(gl.TEXTURE_2D, this.skyView.color);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.irradiance = new RenderTarget(gl, [{ ...f16(gl), filter: gl.NEAREST }]);
    this.irradiance.resize(8, 1);
    this.pTrans = new Program(gl, { name: 'transmittance', vs: FULLSCREEN_VS, fs: TRANSMITTANCE_FS });
    this.pMulti = new Program(gl, { name: 'multiscat', vs: FULLSCREEN_VS, fs: MULTISCAT_FS });
    this.pSkyView = new Program(gl, { name: 'skyview', vs: FULLSCREEN_VS, fs: SKYVIEW_FS });
    this.pIrr = new Program(gl, { name: 'irradiance', vs: FULLSCREEN_VS, fs: IRRADIANCE_FS });
    this.pSky = new Program(gl, { name: 'sky', vs: FULLSCREEN_FAR_VS, fs: SKY_FS });
  }

  /** LUT constantes (transmitancia y dispersión múltiple). Requiere el UBO de frame enlazado. */
  precompute(): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.transmittance.bind();
    this.pTrans.use();
    this.tri.draw();
    this.multiScat.bind();
    this.pMulti.use().tex2D('uTransmittance', this.transmittance.color);
    this.tri.draw();
  }

  /** LUT dependientes del sol/cámara: vista del cielo e irradiancia. */
  update(): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.skyView.bind();
    this.pSkyView.use().tex2D('uTransmittance', this.transmittance.color).tex2D('uMultiScat', this.multiScat.color);
    this.tri.draw();
    this.irradiance.bind();
    this.pIrr.use().tex2D('uSkyView', this.skyView.color);
    this.tri.draw();
  }

  /** Dibuja el cielo en los píxeles de fondo del framebuffer actual. */
  drawSky(): void {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    this.pSky.use()
      .tex2D('uSkyView', this.skyView.color)
      .tex2D('uTransmittance', this.transmittance.color)
      .tex2D('uFarOcean', this.farOcean);
    this.tri.draw();
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  }

  setFarOcean(data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.farOcean);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  /** Transmitancia de la atmósfera desde la cámara hacia una dirección con coseno cenital mu. */
  static transmittance(camY: number, mu: number, out: number[]): number[] {
    const r = RG + 0.2 + Math.max(camY - 63, 0) * 0.001;
    // ¿El rayo choca con el suelo?
    const disc = r * r * (mu * mu - 1) + RG * RG;
    if (mu < 0 && disc >= 0) {
      out[0] = out[1] = out[2] = 0;
      return out;
    }
    const b = r * mu;
    const tMax = -b + Math.sqrt(Math.max(0, b * b - (r * r - RT * RT)));
    const N = 48;
    const dt = tMax / N;
    let odR = 0, odM = 0, odO = 0;
    const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * dt;
      const px = sinT * t;
      const py = r + mu * t;
      const h = Math.sqrt(px * px + py * py) - RG;
      odR += Math.exp(-h / 8) * dt;
      odM += Math.exp(-h / 1.2) * dt;
      odO += Math.max(0, 1 - Math.abs(h - 25) / 15) * dt;
    }
    for (let c = 0; c < 3; c++) out[c] = Math.exp(-(RAY_SCAT[c] * odR + MIE_EXT * odM + OZONE[c] * odO));
    return out;
  }
}
