// WebGL2 helpers: programs with cached uniform setters, render targets, textures.
export class Program {
  constructor(gl, vs, fs, name = 'program', defines = '') {
    this.gl = gl; this.name = name;
    const header = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DArray;\nprecision highp sampler3D;\nprecision highp sampler2DShadow;\n' + defines + '\n';
    const v = compile(gl, gl.VERTEX_SHADER, header + vs, name + '.vs');
    const f = compile(gl, gl.FRAGMENT_SHADER, header + fs, name + '.fs');
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link error in ${name}: ${gl.getProgramInfoLog(p)}`);
    this.p = p;
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    this.samplers = {};
    let unit = 0;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const nm = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(p, info.name);
      this.u[nm] = { loc, type: info.type, size: info.size };
      if (isSampler(gl, info.type)) this.samplers[nm] = unit++;
    }
    gl.useProgram(p);
    for (const [nm, u] of Object.entries(this.samplers)) gl.uniform1i(this.u[nm].loc, u);
  }
  use() { this.gl.useProgram(this.p); return this; }
  set(name, ...v) {
    const u = this.u[name];
    if (!u) return this;
    const gl = this.gl, l = u.loc;
    switch (u.type) {
      case gl.FLOAT: u.size > 1 ? gl.uniform1fv(l, v[0]) : gl.uniform1f(l, v[0]); break;
      case gl.FLOAT_VEC2: v.length === 1 ? gl.uniform2fv(l, v[0]) : gl.uniform2f(l, v[0], v[1]); break;
      case gl.FLOAT_VEC3: v.length === 1 ? gl.uniform3fv(l, v[0]) : gl.uniform3f(l, v[0], v[1], v[2]); break;
      case gl.FLOAT_VEC4: v.length === 1 ? gl.uniform4fv(l, v[0]) : gl.uniform4f(l, v[0], v[1], v[2], v[3]); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(l, v[0]); break;
      case gl.INT_VEC2: gl.uniform2i(l, v[0], v[1]); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(l, false, v[0]); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(l, false, v[0]); break;
      default: gl.uniform1i(l, v[0]);
    }
    return this;
  }
  // bind a texture to a sampler uniform
  tex(name, texture, target) {
    const unit = this.samplers[name];
    if (unit === undefined) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target || texture.target || gl.TEXTURE_2D, texture.tex || texture);
    return this;
  }
}

function isSampler(gl, t) {
  return [gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D, gl.SAMPLER_2D_ARRAY_SHADOW].includes(t);
}

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log);
    let ctx = '';
    if (m) { const ln = +m[1]; ctx = lines.slice(Math.max(0, ln - 4), ln + 2).map((l, i) => `${ln - 3 + i}: ${l}`).join('\n'); }
    throw new Error(`Shader compile error in ${name}:\n${log}\n${ctx}`);
  }
  return s;
}

export function createTexture(gl, w, h, { internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null, mips = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  return { tex: t, w, h, target: gl.TEXTURE_2D, internal, format, type };
}

// A framebuffer with N color attachments and an optional depth texture.
export class RenderTarget {
  constructor(gl, w, h, colors = [{}], depth = false) {
    this.gl = gl; this.colorsSpec = colors; this.depthSpec = depth;
    this.resize(w, h);
  }
  resize(w, h) {
    const gl = this.gl;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.w === w && this.h === h) return;
    this.dispose();
    this.w = w; this.h = h;
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    this.colors = this.colorsSpec.map((spec, i) => {
      const t = createTexture(gl, w, h, { internal: spec.internal || gl.RGBA8, format: spec.format || gl.RGBA, type: spec.type || gl.UNSIGNED_BYTE, filter: spec.filter || gl.LINEAR, wrap: spec.wrap || gl.CLAMP_TO_EDGE });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t.tex, 0);
      return t;
    });
    if (this.depthSpec) {
      const d = this.depthSpec === true ? {} : this.depthSpec;
      if (d.shared) { this.depth = d.shared; }
      else this.depth = createTexture(gl, w, h, { internal: d.internal || gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: d.type || gl.FLOAT, filter: gl.NEAREST });
      if (d.compare) {
        gl.bindTexture(gl.TEXTURE_2D, this.depth.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth.tex, 0);
    }
    gl.drawBuffers(this.colors.length ? this.colors.map((_, i) => gl.COLOR_ATTACHMENT0 + i) : [gl.NONE]);
    if (!this.colors.length) gl.readBuffer(gl.NONE);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) console.error('Framebuffer incomplete', st.toString(16), this.colorsSpec);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind() { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb); gl.viewport(0, 0, this.w, this.h); }
  dispose() {
    const gl = this.gl;
    if (this.fb) gl.deleteFramebuffer(this.fb);
    if (this.colors) for (const c of this.colors) gl.deleteTexture(c.tex);
    if (this.depth && !(this.depthSpec && this.depthSpec.shared)) gl.deleteTexture(this.depth.tex);
    this.fb = null;
  }
}

// Fullscreen triangle VAO
export function fullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export const FULLSCREEN_VS = `
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }`;
