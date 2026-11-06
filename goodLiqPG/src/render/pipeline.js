// Shader-mode ("shaderpack") pipeline: shadow map -> PBR gbuffer -> water/SSR -> volumetric clouds & light ->
// composite (aerial perspective, rainbow) -> TAA -> hand -> bloom -> eye adaptation + ACES tonemap.
import { Program, RenderTarget, FULLSCREEN_VS, createTexture } from '../engine/gl.js';
import { mat4, frustumPlanes } from '../engine/math.js';
import { SHADOW_VS, SHADOW_FS, PBR_TERRAIN_VS, PBR_TERRAIN_FS } from './shaders/terrain.js';
import { WATER_VS, WATER_FS } from './shaders/water.js';
import { GBUF_TERRAIN_FS, DEFERRED_FS } from './shaders/deferred.js';
import * as P from './shaders/post.js';
import { PhysicalSky } from './sky.js';
import { transmittance } from '../game/environment.js';

const QUALITY = {
  low: { shadowRes: 1024, shadowDist: 64, cloudSteps: 18, lightSteps: 3, volSteps: 8, ssr: 0, cloudScale: 0.25, volScale: 0.25, taps: 4, shadowEvery: 3 },
  medium: { shadowRes: 2048, shadowDist: 96, cloudSteps: 26, lightSteps: 4, volSteps: 10, ssr: 16, cloudScale: 0.25, volScale: 0.25, taps: 6, shadowEvery: 2 },
  high: { shadowRes: 2048, shadowDist: 128, cloudSteps: 36, lightSteps: 5, volSteps: 14, ssr: 24, cloudScale: 0.5, volScale: 0.5, taps: 8, shadowEvery: 1 },
  ultra: { shadowRes: 4096, shadowDist: 160, cloudSteps: 56, lightSteps: 6, volSteps: 20, ssr: 40, cloudScale: 0.5, volScale: 0.5, taps: 12, shadowEvery: 1 },
};
const HALTON = Array.from({ length: 16 }, (_, i) => {
  const h = (b, n) => { let f = 1, r = 0; n++; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  return [h(2, i) - 0.5, h(3, i) - 0.5];
});

export class ShaderPipeline {
  constructor(renderer) {
    this.r = renderer;
    const gl = this.gl = renderer.gl;
    const vao = renderer.fsVAO;
    this.vao = vao;
    this.sky = new PhysicalSky(gl, vao);
    this.progShadow = new Program(gl, SHADOW_VS, SHADOW_FS, 'shadow');
    this.progTerrain = new Program(gl, PBR_TERRAIN_VS, PBR_TERRAIN_FS, 'pbrTerrain');
    this.progGbuf = new Program(gl, PBR_TERRAIN_VS, GBUF_TERRAIN_FS, 'gbufTerrain');
    this.progWater = new Program(gl, WATER_VS, WATER_FS, 'water');
    const fs = (src, name) => new Program(gl, FULLSCREEN_VS, src, name);
    this.progNoise = fs(P.NOISE3D_FS, 'noise3d');
    this.progClouds = fs(P.CLOUD_FS, 'clouds');
    this.progCloudTAA = fs(P.CLOUD_TAA_FS, 'cloudTAA');
    this.progVol = fs(P.VOLUMETRIC_FS, 'volumetric');
    this.progDeferred = fs(DEFERRED_FS, 'deferred');
    this.progComposite = fs(P.COMPOSITE_FS, 'composite');
    this.progTAA = fs(P.TAA_FS, 'taa');
    this.progSharpen = fs(P.SHARPEN_FS, 'sharpen');
    this.progDown = fs(P.DOWNSAMPLE_FS, 'bloomDown');
    this.progUp = fs(P.UPSAMPLE_FS, 'bloomUp');
    this.progExposure = fs(P.EXPOSURE_FS, 'exposure');
    this.progFinal = fs(P.FINAL_FS, 'final');
    this.progCopy = fs(P.COPY_FS, 'copy');
    this.setQuality('high', 1);
    this.makeNoise();
    this.frame = 0;
    this.prevViewProj = mat4.create();
    this.prevCamPos = [0, 0, 0];
    this.prevRotVP = mat4.create();
    this.exposure = [0, 1].map(() => new RenderTarget(gl, 1, 1, [{ internal: gl.RGBA16F, type: gl.HALF_FLOAT }]));
    this.expIdx = 0;
    this.lastTime = performance.now();
    this.reset = true;
  }

  setQuality(q, renderScale) {
    this.qname = q; this.q = QUALITY[q] || QUALITY.high; this.renderScale = renderScale ?? 0;
    const gl = this.gl;
    if (this.shadowRT) this.shadowRT.dispose();
    this.shadowRT = new RenderTarget(gl, this.q.shadowRes, this.q.shadowRes, [], { internal: gl.DEPTH_COMPONENT24, type: gl.UNSIGNED_INT, compare: true });
    this.w = 0; this.h = 0;
    this.reset = true;
  }

  makeNoise() {
    const gl = this.gl;
    const mk3d = (size, kind) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, size, size);
      this.progNoise.use().set('u_size', size).set('u_kind', kind);
      gl.bindVertexArray(this.vao);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      for (let z = 0; z < size; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, z);
        this.progNoise.set('u_slice', z);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.generateMipmap(gl.TEXTURE_3D);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      return { tex: t, target: gl.TEXTURE_3D };
    };
    this.shapeNoise = mk3d(64, 0);
    this.detailNoise = mk3d(32, 1);
  }

  ensureTargets(W, H) {
    const s = this.renderScale || Math.min(1, Math.max(0.4, Math.sqrt(1.25e6 / (W * H))));
    const w = Math.max(16, Math.floor(W * s)), h = Math.max(16, Math.floor(H * s));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const gl = this.gl;
    const F16 = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    const all = ['gbuf', 'lit', 'sceneCopy', 'depthCopy', 'comp', 'post', 'cloudCur', 'vol'];
    for (const k of all) if (this[k]) this[k].dispose();
    if (this.litDepthFB) gl.deleteFramebuffer(this.litDepthFB);
    if (this.cloudHist) this.cloudHist.forEach(t => t.dispose());
    if (this.taa) this.taa.forEach(t => t.dispose());
    if (this.bloom) this.bloom.forEach(t => t.dispose());
    const R8 = { internal: gl.RGBA8, filter: gl.NEAREST };
    this.gbuf = new RenderTarget(gl, w, h, [R8, R8, R8, R8], { internal: gl.DEPTH_COMPONENT32F, type: gl.FLOAT });
    this.lit = new RenderTarget(gl, w, h, [F16]);
    this.litDepthFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.litDepthFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lit.colors[0].tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.gbuf.depth.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneCopy = new RenderTarget(gl, w, h, [F16]);
    this.depthCopy = new RenderTarget(gl, w, h, [], { internal: gl.DEPTH_COMPONENT32F, type: gl.FLOAT });
    this.comp = new RenderTarget(gl, w, h, [F16]);
    this.post = new RenderTarget(gl, w, h, [F16], { internal: gl.DEPTH_COMPONENT24, type: gl.UNSIGNED_INT });
    const cs = this.q.cloudScale;
    this.cloudCur = new RenderTarget(gl, w * cs, h * cs, [F16]);
    this.cloudHist = [0, 1].map(() => new RenderTarget(gl, w * cs, h * cs, [F16]));
    this.vol = new RenderTarget(gl, w * this.q.volScale, h * this.q.volScale, [F16]);
    this.taa = [0, 1].map(() => new RenderTarget(gl, w, h, [F16]));
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < 6; i++) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); this.bloom.push(new RenderTarget(gl, bw, bh, [{ internal: gl.R11F_G11F_B10F, format: gl.RGB, type: gl.HALF_FLOAT }])); }
    this.reset = true;
  }

  fullscreen() { const gl = this.gl; gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  computeShadow(cam, env) {
    const L = env.lightDir;
    const D = this.q.shadowDist;
    const up = [0, 0, 1];
    const view = mat4.lookAt(mat4.create(), [L[0] * 300, L[1] * 300, L[2] * 300], [0, 0, 0], up);
    // snap the shadow center to shadow texels (in light space) to avoid shimmering
    const right = [view[0], view[4], view[8]], upv = [view[1], view[5], view[9]];
    const texel = (2 * D) / this.q.shadowRes * 2;
    const cp = cam.pos;
    const rr = right[0] * cp[0] + right[1] * cp[1] + right[2] * cp[2];
    const uu = upv[0] * cp[0] + upv[1] * cp[1] + upv[2] * cp[2];
    const dr = Math.floor(rr / texel) * texel - rr, du = Math.floor(uu / texel) * texel - uu;
    const off = [right[0] * dr + upv[0] * du, right[1] * dr + upv[1] * du, right[2] * dr + upv[2] * du];
    const proj = mat4.ortho(mat4.create(), -D, D, -D, D, 1, 600);
    const m = mat4.multiply(mat4.create(), proj, view);
    mat4.translate(m, m, [-off[0], -off[1], -off[2]]);
    return m;
  }

  setLighting(p, env) {
    p.set('u_shadowMat', this.shadowMat).set('u_shadowRes', this.q.shadowRes).set('u_lightDir', env.lightDir).set('u_lightColor', env.lightColor)
      .set('u_ambUp', env.ambUp).set('u_ambHorizon', env.ambHorizon).set('u_ambDown', env.ambDown).set('u_torchColor', [1.0, 0.52, 0.2])
      .set('u_rain', env.rain).set('u_wetness', this.wetness || 0).set('u_frame', this.frame).set('u_screen', this.w, this.h)
      .set('u_caveAmbient', 1).set('u_nightVision', env.nightVision || 0).set('u_shadowTaps', this.q.taps).tex('u_shadowMap', this.shadowRT.depth);
  }

  mark(label) {
    if (!this.profile) return;
    const gl = this.gl;
    const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING), vp = gl.getParameter(gl.VIEWPORT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._px || (this._px = new Uint8Array(4)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    const t = performance.now();
    if (this._lastMark !== undefined) this.times[this._lastLabel] = (this.times[this._lastLabel] || 0) * 0.8 + (t - this._lastMark) * 0.2;
    this._lastMark = t; this._lastLabel = label;
  }
  render(cam, env) {
    const gl = this.gl, r = this.r;
    this.times = this.times || {}; this._lastMark = undefined;
    this.mark('start');
    const [W, H] = r.resize();
    this.ensureTargets(W, H);
    const now = performance.now();
    const dt = Math.min(0.2, (now - this.lastTime) / 1000); this.lastTime = now;
    this.frame++;
    // wetness lags behind rain like shaderpacks
    const tgt = env.rain > 0.1 && !this.snowy ? 1 : 0;
    this.wetness = (this.wetness || 0) + (tgt - (this.wetness || 0)) * Math.min(1, dt * (tgt ? 0.08 : 0.03));
    const near = 0.05, far = Math.max(600, env.renderDistance * 16 * 2.5);
    const aspect = W / H;
    const proj = mat4.perspective(mat4.create(), cam.fov * Math.PI / 180, aspect, near, far);
    const viewProj = mat4.multiply(mat4.create(), proj, cam.view);
    const j = HALTON[this.frame % 8];
    const jitter = [j[0] * 2 / this.w, j[1] * 2 / this.h];
    cam.proj = proj; cam.viewProj = viewProj;
    const invVP = mat4.invert(mat4.create(), viewProj);
    const planes = frustumPlanes(viewProj);
    this.mark('lut');
    // 1. sky LUT
    this.sky.updateLUT({ sunDir: env.sunDir, moonDir: env.moonDir, camY: cam.pos[1], rain: env.rain });
    this.mark('shadow');
    // 2. shadow map
    const dis0 = this.disable || {};
    const updateShadow = this.reset || !this.shadowWorld || (this.frame % this.q.shadowEvery) === 0 || this.lastLightDir?.some((v, i) => Math.abs(v - env.lightDir[i]) > 0.02);
    if (updateShadow) {
      this.shadowMat = this.computeShadow(cam, env);
      this.shadowWorld = mat4.translate(mat4.create(), this.shadowMat, [-cam.pos[0], -cam.pos[1], -cam.pos[2]]);
      this.lastLightDir = env.lightDir.slice();
    } else this.shadowMat = mat4.translate(mat4.create(), this.shadowWorld, cam.pos);
    this.shadowRT.bind();
    if (updateShadow) gl.clear(gl.DEPTH_BUFFER_BIT);
    if (!dis0.shadow && updateShadow) {
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.2, 2.0);
    const sp = this.progShadow.use();
    sp.set('u_shadowMat', this.shadowMat).set('u_camPos', cam.pos).set('u_time', env.time).set('u_wind', env.wind).set('u_model', mat4.create()).tex('u_albedo', r.atlas.albedo);
    const splanes = frustumPlanes(this.shadowMat);
    const shadowCam = { pos: cam.pos };
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
    sp.set('u_alphaCutoff', -1);
    r.drawList(sp, r.collect(shadowCam, splanes, 0, false));
    gl.disable(gl.CULL_FACE);
    sp.set('u_alphaCutoff', 0.1);
    r.drawList(sp, r.collect(shadowCam, splanes, 1, false));
    const shadowCtx = { cam, env, mode: 'pbr', pass: 'shadow', shadowMat: this.shadowMat, viewProj: this.shadowMat, terrainProgram: () => this.progShadowItems(env, cam) };
    for (const fn of r.extraPasses) fn(gl, shadowCtx, 'shadow');
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.cullFace(gl.BACK); gl.enable(gl.CULL_FACE);

    this.mark('gbuffer');
    // 3. gbuffer (opaque geometry)
    this.gbuf.bind();
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const jvp = mat4.copy(mat4.create(), viewProj); for (let c = 0; c < 4; c++) { jvp[c * 4] += jitter[0] * jvp[c * 4 + 3]; jvp[c * 4 + 1] += jitter[1] * jvp[c * 4 + 3]; }
    const invJVP = mat4.invert(mat4.create(), jvp);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    const tp = this.progGbuf.use();
    tp.set('u_viewProj', viewProj).set('u_jitter', jitter).set('u_camPos', cam.pos).set('u_time', env.time).set('u_wind', env.wind).set('u_model', mat4.create())
      .set('u_lightOverride', 0, 0, 0).set('u_colorMul', 1, 1, 1, 1).set('u_overlayLayer', r.atlas.layers.grass_block_side_overlay ?? 0).set('u_wetness', this.wetness || 0)
      .tex('u_albedo', r.atlas.albedo).tex('u_normalTex', r.atlas.normal).tex('u_specTex', r.atlas.specular);
    gl.enable(gl.CULL_FACE);
    tp.set('u_alphaCutoff', -1);
    let quads = r.drawList(tp, r.collect(cam, planes, 0, false));
    gl.disable(gl.CULL_FACE);
    tp.set('u_alphaCutoff', 0.1);
    quads += r.drawList(tp, r.collect(cam, planes, 1, false));
    gl.enable(gl.CULL_FACE);
    const ctx = {
      cam, env, viewProj, proj, view: cam.view, mode: 'pbr', gbuffer: true, pass: 'opaque', planes, jitter, width: W, height: H,
      setLighting: (p) => this.setLighting(p, env),
      terrainProgram: () => { const p = this.progGbuf.use(); return p.set('u_viewProj', viewProj).set('u_jitter', jitter).set('u_alphaCutoff', 0.1).set('u_camPos', cam.pos); },
    };
    for (const fn of r.extraPasses) fn(gl, ctx, 'opaque');

    // 4. deferred lighting (sky first, lit geometry on top)
    this.mark('deferred');
    this.lit.bind();
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    if (!env.underwater && !env.inLava) this.sky.render({ ...env, invViewProj: invJVP, time: env.time });
    else { gl.clearColor(0.02, 0.05, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const dp = this.progDeferred.use();
    this.setLighting(dp, env);
    dp.set('u_invViewProj', invJVP).tex('u_g0', this.gbuf.colors[0]).tex('u_g1', this.gbuf.colors[1]).tex('u_g2', this.gbuf.colors[2]).tex('u_g3', this.gbuf.colors[3])
      .tex('u_depth', this.gbuf.depth).tex('u_skyLUT', this.sky.lut.colors[0]);
    this.fullscreen();
    gl.depthMask(true);

    // copies for refraction
    this.mark('copies');
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.lit.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sceneCopy.fb);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.gbuf.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depthCopy.fb);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 5. forward translucent: water/ice/portal, particles, weather, selection
    this.mark('translucent');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.litDepthFB);
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const wp = this.progWater.use();
    this.setLighting(wp, env);
    wp.set('u_viewProj', viewProj).set('u_jitter', jitter).set('u_camPos', cam.pos).set('u_time', env.time).set('u_model', mat4.create()).set('u_wind', env.wind)
      .set('u_viewProjNoJitter', viewProj).set('u_invViewProj', invVP).set('u_near', near).set('u_far', far).set('u_underwater', env.underwater ? 1 : 0)
      .set('u_waterFogColor', env.waterFogLinear || [0.02, 0.06, 0.1]).set('u_ssrSteps', this.q.ssr).set('u_waterStyle', this.waterStyle === 'classic' ? 1 : 0)
      .tex('u_albedo', r.atlas.albedo).tex('u_sceneColor', this.sceneCopy.colors[0]).tex('u_sceneDepth', this.depthCopy.depth).tex('u_skyLUT', this.sky.lut.colors[0]);
    gl.disable(gl.CULL_FACE);
    quads += r.drawList(wp, r.collect(cam, planes, 2, true));
    gl.enable(gl.CULL_FACE);
    ctx.pass = 'translucent'; ctx.gbuffer = false;
    gl.depthMask(false);
    for (const fn of r.extraPasses) fn(gl, ctx, 'translucent');
    for (const fn of r.extraPasses) fn(gl, ctx, 'weather');
    gl.depthMask(true);
    r.drawSelection(cam, jvp, env);
    r.stats.quads = quads;

    this.mark('clouds');
    // 6. clouds (low res + temporal)
    const dis = this.disable || {};
    const cloudsOn = env.cloudsEnabled !== false && !dis.clouds;
    const ci = this.frame & 1;
    if (cloudsOn) {
      this.cloudCur.bind();
      gl.disable(gl.DEPTH_TEST);
      const cp = this.progClouds.use();
      const cloudLight = this.cloudLight(env);
      cp.set('u_invViewProj', invVP).set('u_camPos', cam.pos).set('u_lightDir', cloudLight.dir).set('u_lightColor', cloudLight.color).set('u_ambUp', env.ambUp).set('u_ambHorizon', env.ambHorizon)
        .set('u_coverage', env.clouds).set('u_cirrus', env.cirrus).set('u_rain', env.rain).set('u_time', env.cloudTime ?? env.time).set('u_frame', this.frame)
        .set('u_steps', this.q.cloudSteps).set('u_lightSteps', this.q.lightSteps).set('u_near', near).set('u_far', far).set('u_flash', env.skyFlash > 0 ? 1 : 0)
        .tex('u_shape', this.shapeNoise).tex('u_detail', this.detailNoise).tex('u_depth', this.gbuf.depth).tex('u_lut', this.sky.lut.colors[0]);
      this.fullscreen();
      const rotVP = this.rotationViewProj(proj, cam.view);
      this.cloudHist[ci].bind();
      this.progCloudTAA.use().set('u_invViewProj', invVP).set('u_prevViewProjRot', this.prevRotVP).set('u_texel', 1 / this.cloudCur.w, 1 / this.cloudCur.h).set('u_reset', this.reset ? 1 : 0)
        .tex('u_cur', this.cloudCur.colors[0]).tex('u_hist', this.cloudHist[ci ^ 1].colors[0]);
      this.fullscreen();
      this.prevRotVP = rotVP;
    }
    this.mark('vol');
    // 7. volumetric light
    this.vol.bind();
    if (dis.vol) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } else {
    gl.disable(gl.DEPTH_TEST);
    const vp = this.progVol.use();
    const timeOfDay = (env.dayTime % 24000) / 24000;
    const morning = Math.max(0, 1 - Math.abs(((timeOfDay - 0.96 + 1) % 1) - 0.04 * 0) / 0.06);
    const mist = Math.max(morning, env.weatherFog) * (env.underwater ? 0 : 1);
    vp.set('u_invViewProj', invVP).set('u_camPos', cam.pos).set('u_lightDir', env.lightDir).set('u_lightColor', env.lightColor).set('u_ambUp', env.ambUp)
      .set('u_density', 0.0016 + env.weatherFog * 0.006 + env.rain * 0.004).set('u_mist', mist * 0.02).set('u_rain', env.rain).set('u_time', env.time).set('u_frame', this.frame)
      .set('u_steps', this.q.volSteps).set('u_near', near).set('u_far', far).set('u_underwater', env.underwater ? 1 : 0).set('u_waterColor', env.waterFogLinear || [0.05, 0.2, 0.3])
      .set('u_maxDist', env.underwater ? 64 : Math.min(this.q.shadowDist * 1.6, 220)).set('u_caveFactor', env.caveFactor || 0)
      .set('u_shadowMat', this.shadowMat).tex('u_shadowMap', this.shadowRT.depth).tex('u_depth', this.gbuf.depth);
    this.fullscreen();
    }
    this.mark('composite');
    // 8. composite
    this.comp.bind();
    const cp2 = this.progComposite.use();
    cp2.set('u_invViewProj', invVP).set('u_camPos', cam.pos).set('u_near', near).set('u_far', far).set('u_renderDist', env.renderDistance * 16)
      .set('u_aerial', 0.0011 + env.weatherFog * 0.004 + env.rain * 0.003).set('u_underwater', env.underwater ? 1 : 0).set('u_inLava', env.inLava ? 1 : 0)
      .set('u_sunDir', env.sunDir).set('u_rainbow', env.rainbow || 0).set('u_sunColor', env.sunColor).set('u_halfTexel', 1 / this.vol.w, 1 / this.vol.h).set('u_blindness', 0)
      .tex('u_color', this.lit.colors[0]).tex('u_depth', this.gbuf.depth).tex('u_clouds', cloudsOn ? this.cloudHist[ci].colors[0] : this.blankCloud()).tex('u_vol', this.vol.colors[0]).tex('u_lut', this.sky.lut.colors[0]);
    this.fullscreen();
    this.mark('taa');
    // 9. TAA
    const ti = this.frame & 1;
    this.taa[ti].bind();
    const camDelta = [cam.pos[0] - this.prevCamPos[0], cam.pos[1] - this.prevCamPos[1], cam.pos[2] - this.prevCamPos[2]];
    this.progTAA.use().set('u_invViewProj', invJVP).set('u_prevViewProj', this.prevViewProj).set('u_camDelta', camDelta).set('u_texel', 1 / this.w, 1 / this.h)
      .set('u_reset', this.reset ? 1 : 0).tex('u_cur', this.comp.colors[0]).tex('u_hist', this.taa[ti ^ 1].colors[0]).tex('u_depth', this.gbuf.depth);
    this.fullscreen();
    this.prevViewProj = viewProj; this.prevCamPos = cam.pos.slice();
    // sharpen into post target, then the hand on top (kept out of TAA history)
    this.post.bind();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.progSharpen.use().set('u_texel', 1 / this.w, 1 / this.h).set('u_amount', 0.35).tex('u_tex', this.taa[ti].colors[0]);
    this.fullscreen();
    gl.enable(gl.DEPTH_TEST);
    const handCtx = { ...ctx, pass: 'hand', jitter: [0, 0], terrainProgram: () => { const p = this.progTerrain.use(); this.setLighting(p, env); return p.set('u_jitter', 0, 0).set('u_alphaCutoff', 0.1).set('u_camPos', cam.pos); } };
    handCtx.setLighting = (p) => { this.setLighting(p, env); };
    for (const fn of r.extraPasses) fn(gl, handCtx, 'hand');
    gl.disable(gl.DEPTH_TEST);
    this.mark('bloom');
    // 10. bloom
    let src = this.post;
    for (let i = 0; i < this.bloom.length; i++) {
      const dst = this.bloom[i]; dst.bind();
      this.progDown.use().set('u_texel', 1 / src.w, 1 / src.h).set('u_first', i === 0 ? 1 : 0).tex('u_tex', src.colors[0]);
      this.fullscreen(); src = dst;
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.bloom.length - 1; i > 0; i--) {
      const dst = this.bloom[i - 1]; dst.bind();
      this.progUp.use().set('u_texel', 1 / this.bloom[i].w, 1 / this.bloom[i].h).set('u_radius', 1).tex('u_tex', this.bloom[i].colors[0]);
      this.fullscreen();
    }
    gl.disable(gl.BLEND);
    this.mark('exposure');
    // 11. exposure
    const ei = this.expIdx; this.expIdx ^= 1;
    this.exposure[this.expIdx].bind();
    this.progExposure.use().set('u_dt', dt).set('u_reset', this.reset ? 1 : 0).tex('u_tex', this.bloom[3].colors[0]).tex('u_prev', this.exposure[ei].colors[0]);
    this.fullscreen();
    this.mark('final');
    // 12. final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    const night = Math.max(0, Math.min(1, -env.sunDir[1] * 5));
    this.progFinal.use().set('u_bloomStrength', 0.055 + env.rain * 0.02).set('u_exposureBias', env.exposureBias || 1).set('u_underwater', env.underwater ? 1 : 0).set('u_time', env.time)
      .set('u_saturation', 1.12).set('u_vignette', 0.45).set('u_nightDesat', night)
      .tex('u_color', this.post.colors[0]).tex('u_bloom', this.bloom[0].colors[0]).tex('u_exposure', this.exposure[this.expIdx].colors[0]);
    this.fullscreen();
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    this.mark('end');
    this.reset = false;
  }

  rotationViewProj(proj, view) {
    const v = mat4.copy(mat4.create(), view); v[12] = v[13] = v[14] = 0;
    return mat4.multiply(mat4.create(), proj, v);
  }
  blankCloud() {
    if (!this._blank) this._blank = createTexture(this.gl, 1, 1, { internal: this.gl.RGBA16F, type: this.gl.HALF_FLOAT, data: new Uint16Array([0, 0, 0, 15360]) });
    return this._blank;
  }
  cloudLight(env) {
    // light reaching cloud altitude: sun survives longer (warm afterglow), switch to moon at night
    const c = this._cl || (this._cl = { t: -1 });
    if (Math.abs(c.t - env.dayTime) > 4 || c.rain !== env.rain) {
      c.t = env.dayTime; c.rain = env.rain;
      const s = env.sunDir, sunUp = s[1] > -0.12;
      const d = sunUp ? s : env.moonDir;
      const T = transmittance([0, 6360e3 + 1100, 0], [d[0], Math.max(d[1], -0.08), d[2]], 16);
      const vis = sunUp ? Math.min(1, Math.max(0, (s[1] + 0.12) / 0.1)) : Math.min(1, Math.max(0, (d[1] + 0.05) / 0.1));
      const I = sunUp ? 3.6 : 0.075;
      c.dir = d;
      c.color = T.map((v, i) => v * I * vis * (sunUp ? 1 : [0.75, 0.88, 1.25][i]) * (1 - env.rain * 0.7));
    }
    return c;
  }
  progShadowItems(env, cam) {
    const p = this.progShadow.use();
    return p.set('u_shadowMat', this.shadowMat).set('u_camPos', cam.pos).set('u_alphaCutoff', 0.1);
  }
}
