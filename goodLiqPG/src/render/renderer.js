// Main renderer: owns chunk GPU meshes and draws the world in vanilla or shader ("shaderpack") mode.
import { Program, RenderTarget, createTexture, fullscreenVAO, FULLSCREEN_VS } from '../engine/gl.js';
import { mat4, frustumPlanes, aabbInFrustum } from '../engine/math.js';
import { MIN_Y, SECTIONS } from '../world/constants.js';
import { VANILLA_TERRAIN_VS, VANILLA_TERRAIN_FS, SHADOW_VS, SHADOW_FS, PBR_TERRAIN_VS, PBR_TERRAIN_FS } from './shaders/terrain.js';
import { VanillaSky, PhysicalSky } from './sky.js';
import { tickAnimatedTextures } from '../textures/atlas.js';
import { ShaderPipeline } from './pipeline.js';

const LINE_VS = `
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
void main(){ gl_Position = u_mvp * vec4(a_pos, 1.0); }`;
const LINE_FS = `
uniform vec4 u_color; out vec4 o; void main(){ o = u_color; }`;
const CRACK_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_mvp; out vec2 v_uv;
void main(){ gl_Position = u_mvp * vec4(a_pos, 1.0); v_uv = a_uv; }`;
const CRACK_FS = `
uniform sampler2DArray u_albedo; uniform float u_layer; in vec2 v_uv; out vec4 o;
void main(){ vec4 t = texture(u_albedo, vec3(v_uv, u_layer)); if (t.a < 0.01) discard; o = vec4(t.rgb * 2.0, t.a); }`;

export class Renderer {
  constructor(canvas, atlas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;
    this.extCBF = gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.atlas = atlas;
    this.meshes = new Map();
    this.quadIndexCount = 0;
    this.indexBuffer = gl.createBuffer();
    this.ensureIndices(1 << 17);
    this.fsVAO = fullscreenVAO(gl);
    this.vanillaProg = new Program(gl, VANILLA_TERRAIN_VS, VANILLA_TERRAIN_FS, 'terrain');
    this.lineProg = new Program(gl, LINE_VS, LINE_FS, 'lines');
    this.crackProg = new Program(gl, CRACK_VS, CRACK_FS, 'crack');
    this.vsky = new VanillaSky(gl);
    this.lightmapData = new Uint8Array(16 * 16 * 4);
    this.lightmapTex = createTexture(gl, 16, 16, { filter: gl.LINEAR });
    this.stats = { chunks: 0, drawn: 0, quads: 0 };
    this.frame = 0;
    this.extraPasses = [];   // callbacks(gl, ctx, pass) for entities/particles/etc.
    // outline buffers
    this.lineVAO = gl.createVertexArray();
    this.lineBuf = gl.createBuffer();
    gl.bindVertexArray(this.lineVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.crackVAO = gl.createVertexArray();
    this.crackBuf = gl.createBuffer();
    gl.bindVertexArray(this.crackVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.crackBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    this.shaders = null;   // ShaderPipeline (lazy)
    this.shaderMode = false;
  }

  ensureIndices(quads) {
    if (quads <= this.quadIndexCount) return;
    let n = Math.max(quads, this.quadIndexCount * 2);
    const idx = new Uint32Array(n * 6);
    for (let q = 0, i = 0; q < n; q++) {
      const v = q * 4;
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2; idx[i++] = v + 2; idx[i++] = v + 3; idx[i++] = v;
    }
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadIndexCount = n;
    // rebind for existing VAOs
    for (const m of this.meshes.values()) { gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); }
    gl.bindVertexArray(null);
  }

  uploadChunk(c, msg) {
    const gl = this.gl;
    let m = this.meshes.get(c.key);
    if (!m) {
      m = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), cx: c.cx, cz: c.cz, key: c.key };
      gl.bindVertexArray(m.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.SHORT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, false, 24, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.BYTE, false, 24, 12);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 24, 16);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 24, 20);
      gl.bindVertexArray(null);
      this.meshes.set(c.key, m);
      m.born = performance.now();
    }
    // material byte (offset 15) is unsigned in the mesher but attribute is BYTE: values < 128 so it's fine
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, msg.data, gl.STATIC_DRAW);
    m.layers = msg.layers;
    m.vertexCount = msg.data.byteLength / 24;
    this.ensureIndices(m.vertexCount / 4 + 16);
    // section y bounds for culling: compute non-empty range
    c.mesh = m;
  }

  removeChunk(c) {
    const m = this.meshes.get(c.key);
    if (!m) return;
    const gl = this.gl;
    gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo);
    this.meshes.delete(c.key);
  }

  // Lightmap: port of LightTexture.updateLightTexture (1.20)
  updateLightmap(env) {
    const skyDarken = env.skyDarken; // 0.2..1
    const f1 = env.skyFlash > 0 ? 1 : skyDarken * 0.95 + 0.05;
    const sky = [skyDarken, skyDarken, 1].map(v => v + (1 - v) * 0.35);
    const flicker = (env.flicker || 0) + 1.5;
    const gamma = env.gamma ?? 0.5;
    const nv = env.nightVision || 0;
    const bright = (l) => { const f = l / 15; return f / (4 - 3 * f); };
    const notGamma = (x) => { const y = 1 - x; return 1 - y * y * y * y; };
    for (let s = 0; s < 16; s++) for (let b = 0; b < 16; b++) {
      const f8 = bright(s) * f1;
      const f9 = bright(b) * flicker;
      const f10 = f9 * ((f9 * 0.6 + 0.4) * 0.6 + 0.4);
      const f11 = f9 * (f9 * f9 * 0.6 + 0.4);
      let c = [f9, f10, f11];
      c = c.map((v, i) => v + sky[i] * f8);
      c = c.map(v => v + (0.75 - v) * 0.04);
      if (nv > 0) { const mx = Math.max(...c); if (mx < 1) c = c.map(v => v + (v / mx - v) * nv); }
      c = c.map(v => Math.min(1, Math.max(0, v)));
      c = c.map(v => v + (notGamma(v) - v) * Math.max(0, gamma));
      c = c.map(v => v + (0.75 - v) * 0.04);
      c = c.map(v => Math.min(1, Math.max(0, v)));
      const i = (s * 16 + b) * 4;
      this.lightmapData[i] = c[0] * 255; this.lightmapData[i + 1] = c[1] * 255; this.lightmapData[i + 2] = c[2] * 255; this.lightmapData[i + 3] = 255;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lightmapTex.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, this.lightmapData);
  }

  tickTextures() { tickAnimatedTextures(this.gl, this.atlas); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return [w, h];
  }

  // Collect visible draw ranges for a layer: returns list of [mesh, startQuad, quadCount, ox, oy, oz]
  collect(cam, planes, layer, sortBackToFront) {
    const out = [];
    const [px, py, pz] = cam.pos;
    for (const m of this.meshes.values()) {
      const L = m.layers[layer];
      if (!L || L.count === 0) continue;
      const x0 = m.cx * 16, z0 = m.cz * 16;
      if (!aabbInFrustum(planes, x0 - px, MIN_Y - py, z0 - pz, x0 + 16 - px, MIN_Y + 384 - py, z0 + 16 - pz)) continue;
      // per-section culling, merging runs
      let runStart = -1;
      const sec = L.sec;
      for (let s = 0; s <= SECTIONS; s++) {
        let vis = false;
        if (s < SECTIONS && sec[s + 1] > sec[s]) {
          const y0 = MIN_Y + s * 16;
          vis = aabbInFrustum(planes, x0 - px, y0 - py, z0 - pz, x0 + 16 - px, y0 + 16 - py, z0 + 16 - pz);
        }
        if (vis && runStart < 0) runStart = s;
        if (!vis && runStart >= 0) {
          const a = sec[runStart], b = sec[s];
          if (b > a) out.push([m, a / 4, (b - a) / 4, x0 - px, MIN_Y - py, z0 - pz]);
          runStart = -1;
        }
      }
    }
    const d2 = (e) => (e[3] + 8) ** 2 + (e[5] + 8) ** 2;
    out.sort((a, b) => sortBackToFront ? d2(b) - d2(a) : d2(a) - d2(b));
    return out;
  }

  drawList(prog, list) {
    const gl = this.gl;
    let quads = 0;
    for (const [m, start, count, ox, oy, oz] of list) {
      prog.set('u_chunkOff', ox, oy, oz);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_INT, start * 24);
      quads += count;
    }
    gl.bindVertexArray(null);
    return quads;
  }

  // ---- Vanilla frame ---------------------------------------------------------------------------------
  renderVanilla(cam, env) {
    const gl = this.gl;
    const [w, h] = this.resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    const fc = env.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mat4.perspective(mat4.create(), cam.fov * Math.PI / 180, w / h, 0.05, Math.max(512, env.renderDistance * 16 * 4));
    const view = cam.view;
    const viewProj = mat4.multiply(mat4.create(), proj, view);
    cam.proj = proj; cam.viewProj = viewProj;
    const planes = frustumPlanes(viewProj);
    if (!env.underwater && !env.inLava) this.vsky.render({ ...env, view, proj });
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    const p = this.vanillaProg.use();
    p.set('u_viewProj', viewProj).set('u_camPos', cam.pos).set('u_time', env.time).set('u_wind', env.wind).set('u_model', mat4.create()).set('u_lightOverride', 0, 0, 0).set('u_colorMul', 1, 1, 1, 1)
      .set('u_overlayLayer', this.atlas.layers.grass_block_side_overlay ?? 0).set('u_fogColor', [...fc, 1]).set('u_fog', env.fogStart, env.fogEnd)
      .tex('u_albedo', this.atlas.albedo).tex('u_lightmap', this.lightmapTex).set('u_translucent', 0);
    gl.disable(gl.BLEND);
    p.set('u_alphaCutoff', -1);
    let quads = this.drawList(p, this.collect(cam, planes, 0, false));
    gl.disable(gl.CULL_FACE);
    p.set('u_alphaCutoff', 0.1);
    quads += this.drawList(p, this.collect(cam, planes, 1, false));
    gl.enable(gl.CULL_FACE);
    const ctx = { cam, env, viewProj, proj, view, mode: 'vanilla', planes, width: w, height: h };
    ctx.terrainProgram = () => this.vanillaProg.use().set('u_viewProj', viewProj).set('u_alphaCutoff', 0.1).set('u_translucent', 0);
    for (const fn of this.extraPasses) fn(gl, ctx, 'opaque');
    // clouds before translucent water like vanilla fancy
    for (const fn of this.extraPasses) fn(gl, ctx, 'clouds');
    // translucent
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    p.use().set('u_alphaCutoff', 0.01).set('u_translucent', 1);
    // above water: cull the back-facing copies of water quads (they would blend twice); underwater keeps both sides
    if (!env.underwater) gl.enable(gl.CULL_FACE);
    quads += this.drawList(p, this.collect(cam, planes, 2, true));
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    for (const fn of this.extraPasses) fn(gl, ctx, 'translucent');
    this.drawSelection(cam, viewProj, env);
    for (const fn of this.extraPasses) fn(gl, ctx, 'weather');
    for (const fn of this.extraPasses) fn(gl, ctx, 'hand');
    this.stats.quads = quads;
    this.frame++;
  }

  setShaderMode(on, quality = 'auto', scale = 0, waterStyle = 'shader') {
    this.shaderMode = !!on;
    this.waterStyle = waterStyle;
    if (this.shaders) this.shaders.waterStyle = waterStyle;
    if (quality === 'auto') quality = /intel|mesa|swiftshader|llvmpipe|mali|adreno|apple gpu/i.test(this.glInfo || '') && !/nvidia|radeon|geforce|rtx/i.test(this.glInfo || '') ? 'medium' : 'high';
    if (on) {
      if (!this.shaders) {
        try { this.shaders = new ShaderPipeline(this); this.shaders.waterStyle = waterStyle; } catch (e) { console.error('shader pipeline failed', e); this.shaderMode = false; return; }
      }
      if (this.shaders.qname !== quality || this.shaders.renderScale !== scale) this.shaders.setQuality(quality, scale);
    }
  }

  render(cam, env) {
    if (this.shaderMode && this.shaders) this.shaders.render(cam, env);
    else this.renderVanilla(cam, env);
  }

  // ---- Selection outline + breaking cracks ---------------------------------------------------------------
  drawSelection(cam, viewProj, env, jitter) {
    const gl = this.gl;
    const sel = env.selection;
    if (sel && sel.boxes && !env.hideHud) {
      const v = [];
      const e = 0.002;
      for (const b of sel.boxes) {
        const x0 = sel.x + b[0] - e - cam.pos[0], y0 = sel.y + b[1] - e - cam.pos[1], z0 = sel.z + b[2] - e - cam.pos[2];
        const x1 = sel.x + b[3] + e - cam.pos[0], y1 = sel.y + b[4] + e - cam.pos[1], z1 = sel.z + b[5] + e - cam.pos[2];
        const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
        for (const [a, bb] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) v.push(...c[a], ...c[bb]);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.lineProg.use().set('u_mvp', viewProj).set('u_color', 0, 0, 0, 0.4);
      gl.bindVertexArray(this.lineVAO);
      gl.drawArrays(gl.LINES, 0, v.length / 3);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (sel && env.breakStage >= 0 && sel.boxes) {
      const layer = this.atlas.layers['destroy_stage_' + env.breakStage];
      if (layer !== undefined) {
        const v = [];
        const e = 0.003;
        for (const b of sel.boxes) {
          const x0 = sel.x + b[0] - e - cam.pos[0], y0 = sel.y + b[1] - e - cam.pos[1], z0 = sel.z + b[2] - e - cam.pos[2];
          const x1 = sel.x + b[3] + e - cam.pos[0], y1 = sel.y + b[4] + e - cam.pos[1], z1 = sel.z + b[5] + e - cam.pos[2];
          const faces = [
            [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
            [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]], [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]],
            [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]],
          ];
          const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
          for (const f of faces) for (const k of [0, 1, 2, 2, 3, 0]) v.push(...f[k], ...uv[k]);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.crackBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
        gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR);
        gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -10);
        this.crackProg.use().set('u_mvp', viewProj).set('u_layer', layer).tex('u_albedo', this.atlas.albedo);
        gl.bindVertexArray(this.crackVAO);
        gl.drawArrays(gl.TRIANGLES, 0, v.length / 5);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
    gl.bindVertexArray(null);
  }
}

export { Program, RenderTarget, FULLSCREEN_VS, SHADOW_VS, SHADOW_FS, PBR_TERRAIN_VS, PBR_TERRAIN_FS, PhysicalSky };
