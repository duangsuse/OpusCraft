// Utilidades WebGL2: programas, texturas, framebuffers y buffers uniformes.

export type GL = WebGL2RenderingContext;

export interface GLCaps {
  anisotropy: number;
  anisoExt: EXT_texture_filter_anisotropic | null;
  floatLinear: boolean;
  renderer: string;
}

export function createContext(canvas: HTMLCanvasElement): { gl: GL; caps: GLCaps } {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('Tu navegador no soporta WebGL2.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Tu GPU/navegador no soporta renderizado en coma flotante (EXT_color_buffer_float).');
  }
  const floatLinear = !!gl.getExtension('OES_texture_float_linear');
  const anisoExt =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    (gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') as EXT_texture_filter_anisotropic | null);
  const anisotropy = anisoExt ? (gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1;
  let renderer = 'desconocido';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  return { gl, caps: { anisotropy, anisoExt, floatLinear, renderer } };
}

// ------------------------------------------------------------------ shaders

function numberLines(src: string): string {
  return src
    .split('\n')
    .map((l, i) => String(i + 1).padStart(4, ' ') + ': ' + l)
    .join('\n');
}

/** Empieza a compilar un shader (sin esperar al resultado). */
function startShader(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

/** Si el shader no compiló, lo cuenta (con el código numerado) y lanza el error. */
function checkShader(gl: GL, sh: WebGLShader, src: string, name: string, kind: string): void {
  if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return;
  const log = gl.getShaderInfoLog(sh);
  console.error(`Error compilando ${name} (${kind}):
${log}
${numberLines(src)}`);
  throw new Error(`Shader ${name}: ${log}`);
}

export interface ProgramSource {
  name: string;
  vs: string;
  fs: string;
  defines?: Record<string, string | number | boolean>;
}

function withDefines(src: string, defines?: Record<string, string | number | boolean>, fragment = false): string {
  const header = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp sampler2DArray;\nprecision highp sampler3D;\nprecision highp sampler2DShadow;\n';
  let defs = fragment ? '#define IS_FRAGMENT\n' : '';
  if (defines) {
    for (const [k, v] of Object.entries(defines)) {
      if (v === false) continue;
      defs += `#define ${k} ${v === true ? '' : v}\n`;
    }
  }
  return header + defs + src;
}

/**
 * Programa de shaders. Se compila y enlaza sin esperar al resultado (con KHR_parallel_shader_compile el navegador
 * lo hace en otros hilos): la comprobación y la preparación (bloque Frame, samplers) se hacen la primera vez que
 * se usa, o antes con Program.finishAll cuando Program.allReady dice que ya han terminado.
 */
export class Program {
  private readonly prog: WebGLProgram;
  readonly name: string;
  private gl: GL;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private samplerUnits = new Map<string, number>();
  private pending: { vs: WebGLShader; fs: WebGLShader; vsSrc: string; fsSrc: string } | null;

  private static open = new Set<Program>();
  private static parallel = new WeakMap<GL, { COMPLETION_STATUS_KHR: number } | null>();

  constructor(gl: GL, src: ProgramSource) {
    this.gl = gl;
    this.name = src.name;
    const vsSrc = withDefines(src.vs, src.defines), fsSrc = withDefines(src.fs, src.defines, true);
    const vs = startShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = startShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    this.prog = p;
    this.pending = { vs, fs, vsSrc, fsSrc };
    Program.open.add(this);
    if (!Program.parallel.has(gl)) Program.parallel.set(gl, gl.getExtension('KHR_parallel_shader_compile'));
  }

  /** El programa de WebGL (ya comprobado y preparado). */
  get program(): WebGLProgram {
    this.finish();
    return this.prog;
  }

  /** ¿Ha terminado el navegador de compilarlo? (sin la extensión, se da por terminado: se compila al usarlo). */
  get ready(): boolean {
    if (!this.pending) return true;
    const ext = Program.parallel.get(this.gl);
    return !ext || this.gl.getProgramParameter(this.prog, ext.COMPLETION_STATUS_KHR) === true;
  }

  /** ¿Han terminado todos los programas creados? */
  static allReady(): boolean {
    for (const p of Program.open) if (!p.ready) return false;
    return true;
  }

  /** Comprueba y prepara todos los programas pendientes (lanza el primer error de compilación). */
  static finishAll(): void {
    for (const p of [...Program.open]) p.finish();
  }

  /** Comprueba el enlace (y, si falla, la compilación, con el código numerado) y prepara el programa. */
  private finish(): void {
    const pend = this.pending;
    if (!pend) return;
    this.pending = null;
    Program.open.delete(this);
    const gl = this.gl, p = this.prog;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      checkShader(gl, pend.vs, pend.vsSrc, this.name, 'vertex');
      checkShader(gl, pend.fs, pend.fsSrc, this.name, 'fragment');
      throw new Error(`Programa ${this.name}: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(pend.vs);
    gl.deleteShader(pend.fs);
    const previous = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    // Enlaza el bloque uniforme Frame (si existe) al punto 0.
    const blockIndex = gl.getUniformBlockIndex(p, 'Frame');
    if (blockIndex !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, blockIndex, 0);
    // Asigna unidades de textura a los samplers en orden de declaración.
    gl.useProgram(p);
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    let unit = 0;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      if (!info) continue;
      const t = info.type;
      if (
        t === gl.SAMPLER_2D ||
        t === gl.SAMPLER_2D_ARRAY ||
        t === gl.SAMPLER_3D ||
        t === gl.SAMPLER_2D_SHADOW ||
        t === gl.INT_SAMPLER_2D ||
        t === gl.UNSIGNED_INT_SAMPLER_2D ||
        t === gl.SAMPLER_CUBE
      ) {
        const loc = gl.getUniformLocation(p, info.name);
        gl.uniform1i(loc, unit);
        this.samplerUnits.set(info.name, unit);
        unit++;
      }
    }
    // (El que estaba puesto puede haberse borrado entretanto: entonces no se vuelve a poner.)
    gl.useProgram(previous && gl.isProgram(previous) ? previous : null);
  }

  use(): this {
    this.finish();
    this.gl.useProgram(this.prog);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.uniforms.get(name);
    if (l === undefined) {
      this.finish();
      l = this.gl.getUniformLocation(this.prog, name);
      this.uniforms.set(name, l);
    }
    return l;
  }

  /** Enlaza una textura al sampler indicado (si el shader lo usa). */
  tex(name: string, target: number, texture: WebGLTexture | null, sampler: WebGLSampler | null = null): this {
    this.finish();
    const unit = this.samplerUnits.get(name);
    if (unit === undefined) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, texture);
    gl.bindSampler(unit, sampler);
    return this;
  }

  tex2D(name: string, texture: WebGLTexture | null, sampler: WebGLSampler | null = null): this {
    return this.tex(name, this.gl.TEXTURE_2D, texture, sampler);
  }

  f1(name: string, v: number): this {
    this.gl.uniform1f(this.loc(name), v);
    return this;
  }
  f2(name: string, a: number, b: number): this {
    this.gl.uniform2f(this.loc(name), a, b);
    return this;
  }
  f3(name: string, a: number, b: number, c: number): this {
    this.gl.uniform3f(this.loc(name), a, b, c);
    return this;
  }
  f4(name: string, a: number, b: number, c: number, d: number): this {
    this.gl.uniform4f(this.loc(name), a, b, c, d);
    return this;
  }
  i1(name: string, v: number): this {
    this.gl.uniform1i(this.loc(name), v);
    return this;
  }
  m4(name: string, m: Float32Array): this {
    this.gl.uniformMatrix4fv(this.loc(name), false, m);
    return this;
  }
}

// ------------------------------------------------------------------ texturas y framebuffers

export interface TexOptions {
  internalFormat: number;
  format: number;
  type: number;
  filter?: number;
  wrap?: number;
  mipmaps?: boolean;
}

export function createTexture2D(gl: GL, w: number, h: number, o: TexOptions, data: ArrayBufferView | null = null): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, o.internalFormat, w, h, 0, o.format, o.type, data);
  const filter = o.filter ?? gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, o.wrap ?? gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.wrap ?? gl.CLAMP_TO_EDGE);
  if (o.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export class RenderTarget {
  fbo: WebGLFramebuffer;
  width = 0;
  height = 0;
  colors: WebGLTexture[] = [];
  depth: WebGLTexture | null = null;
  private gl: GL;
  private colorOpts: TexOptions[];
  private depthMode: 'none' | 'texture' | 'external';

  constructor(gl: GL, colorOpts: TexOptions[], depthMode: 'none' | 'texture' | 'external' = 'none') {
    this.gl = gl;
    this.colorOpts = colorOpts;
    this.depthMode = depthMode;
    this.fbo = gl.createFramebuffer()!;
  }

  resize(w: number, h: number, externalDepth: WebGLTexture | null = null): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    const gl = this.gl;
    if (w === this.width && h === this.height && this.depthMode !== 'external') return;
    this.width = w;
    this.height = h;
    for (const t of this.colors) gl.deleteTexture(t);
    this.colors = [];
    if (this.depth && this.depthMode === 'texture') gl.deleteTexture(this.depth);
    this.depth = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const bufs: number[] = [];
    this.colorOpts.forEach((o, i) => {
      const t = createTexture2D(gl, w, h, o);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      this.colors.push(t);
      bufs.push(gl.COLOR_ATTACHMENT0 + i);
    });
    if (this.depthMode === 'texture') {
      const d = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, d);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, d, 0);
      this.depth = d;
    } else if (this.depthMode === 'external') {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, externalDepth, 0);
      this.depth = externalDepth;
    }
    if (bufs.length > 0) gl.drawBuffers(bufs);
    else {
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incompleto: 0x' + status.toString(16));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  get color(): WebGLTexture {
    return this.colors[0];
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.colors) gl.deleteTexture(t);
    if (this.depth && this.depthMode === 'texture') gl.deleteTexture(this.depth);
    gl.deleteFramebuffer(this.fbo);
  }
}

/** Buffer uniforme (std140) compartido por todos los programas en el punto de enlace 0. */
export class UniformBuffer {
  readonly data: Float32Array;
  private buffer: WebGLBuffer;
  private gl: GL;

  constructor(gl: GL, floats: number) {
    this.gl = gl;
    this.data = new Float32Array(floats);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.buffer);
  }

  upload(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.data);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.buffer);
  }
}

/** Triángulo que cubre toda la pantalla (sin atributos: usa gl_VertexID). */
export class FullscreenTriangle {
  private vao: WebGLVertexArrayObject;
  private gl: GL;
  constructor(gl: GL) {
    this.gl = gl;
    this.vao = gl.createVertexArray()!;
  }
  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export const FULLSCREEN_VS = `
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Triángulo a pantalla completa situado en el plano lejano (para el cielo). */
export const FULLSCREEN_FAR_VS = `
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}
`;
