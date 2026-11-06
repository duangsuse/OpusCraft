// Sky rendering. VanillaSky reproduces LevelRenderer.renderSky geometry exactly (sky disc, sunrise fan, sun/moon quads,
// java-seeded star field, dark disc). PhysicalSky computes an atmospheric-scattering sky-view LUT for shader mode.
import { Program, FULLSCREEN_VS, createTexture, RenderTarget } from '../engine/gl.js';
import { mat4 } from '../engine/math.js';
import { JavaRandom } from './javarandom.js';
import { ATMOSPHERE, NOISE } from './shaders/common.js';

const POS_COLOR_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_col;
uniform mat4 u_mvp; uniform mat4 u_model;
out vec4 v_col; out float v_dist;
void main(){ vec4 wp = u_model * vec4(a_pos,1.0); gl_Position = u_mvp * vec4(a_pos,1.0); v_col = a_col; v_dist = length(wp.xyz); }`;
const POS_COLOR_FS = `
uniform vec4 u_color; uniform vec4 u_fogColor; uniform vec2 u_fog; uniform float u_useFog;
in vec4 v_col; in float v_dist; out vec4 o;
void main(){
  vec4 c = v_col * u_color;
  if (u_useFog > 0.5) { float f = v_dist <= u_fog.x ? 0.0 : (v_dist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_dist) : 1.0); c.rgb = mix(c.rgb, u_fogColor.rgb, f * u_fogColor.a); }
  o = c;
}`;
const TEX_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_mvp; out vec2 v_uv;
void main(){ gl_Position = u_mvp * vec4(a_pos,1.0); v_uv = a_uv; }`;
const TEX_FS = `
uniform sampler2D u_tex; uniform vec4 u_color; uniform vec4 u_uvRect;
in vec2 v_uv; out vec4 o;
void main(){ vec4 t = texture(u_tex, u_uvRect.xy + v_uv * u_uvRect.zw); o = t * u_color; }`;

// procedural pixel-art sun (32x32) and moon phases (128x64), vanilla-like
export function paintSunMoon() {
  const sun = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const dx = Math.max(Math.abs(x - 15.5) - 0, 0), dy = Math.abs(y - 15.5);
    const d = Math.max(dx, dy);
    let c = [0, 0, 0, 0];
    if (d < 4) c = [255, 255, 255, 255];
    else if (d < 6) c = [255, 255, 200, 255];
    else if (d < 8) c = [255, 255, 120, 255];
    else if (d < 9) c = [255, 230, 60, 200];
    else if (d < 11) c = [200, 140, 20, 90];
    else if (d < 13) c = [120, 70, 0, 35];
    sun.set(c, i);
  }
  const moon = new Uint8Array(128 * 64 * 4);
  // base moon face 32x32 with craters, center square 16x16
  const face = (x, y) => {
    const dx = Math.abs(x - 15.5), dy = Math.abs(y - 15.5), d = Math.max(dx, dy);
    if (d >= 8) return d < 10 ? [40, 40, 60, 60] : null;
    let v = 210;
    const craters = [[11, 11, 2], [18, 13, 1.5], [14, 19, 2.2], [20, 20, 1.2], [12, 17, 1]];
    for (const [cx, cy, r] of craters) if (Math.hypot(x - cx, y - cy) < r) v = 160;
    if ((x * 7 + y * 13) % 11 === 0) v -= 15;
    return [v, v, v + 20, 255];
  };
  for (let phase = 0; phase < 8; phase++) {
    const ox = (phase % 4) * 32, oy = Math.floor(phase / 4) * 32;
    // phase 0 full moon ... 4 new moon. lit fraction & side
    const lit = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75][phase];
    const waxing = phase > 4;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      let c = face(x, y);
      if (!c) continue;
      if (c[3] === 255) {
        const u = (x - 7.5) / 16; // 0..1 across face
        const shadowed = waxing ? u < 1 - lit : u > lit;
        if (phase !== 0 && (shadowed || phase === 4)) c = [c[0] * 0.12, c[1] * 0.12, c[2] * 0.16, 255];
      }
      moon.set(c, ((oy + y) * 128 + ox + x) * 4);
    }
  }
  return { sun, moon };
}

export class VanillaSky {
  constructor(gl) {
    this.gl = gl;
    this.pc = new Program(gl, POS_COLOR_VS, POS_COLOR_FS, 'vsky');
    this.pt = new Program(gl, TEX_VS, TEX_FS, 'vsun');
    const { sun, moon } = paintSunMoon();
    this.sunTex = createTexture(gl, 32, 32, { data: sun, filter: gl.NEAREST });
    this.moonTex = createTexture(gl, 128, 64, { data: moon, filter: gl.NEAREST });
    // sky disc (octagon fan) at +16 and dark disc at -16
    const disc = (y) => {
      const v = [0, y, 0, 1, 1, 1, 1];
      const f = Math.sign(y) * 512;
      for (let i = -180; i <= 180; i += 45) v.push(f * Math.cos(i * Math.PI / 180), y, 512 * Math.sin(i * Math.PI / 180), 1, 1, 1, 1);
      return this.vao(new Float32Array(v), [3, 4]);
    };
    this.skyDisc = disc(16); this.darkDisc = disc(-16);
    // stars
    const r = new JavaRandom(10842);
    const sv = [];
    for (let j = 0; j < 1500; j++) {
      let d0 = r.nextFloat() * 2 - 1, d1 = r.nextFloat() * 2 - 1, d2 = r.nextFloat() * 2 - 1;
      const d3 = 0.15 + r.nextFloat() * 0.1;
      let d4 = d0 * d0 + d1 * d1 + d2 * d2;
      if (d4 < 1 && d4 > 0.01) {
        d4 = 1 / Math.sqrt(d4); d0 *= d4; d1 *= d4; d2 *= d4;
        const d5 = d0 * 100, d6 = d1 * 100, d7 = d2 * 100;
        const d8 = Math.atan2(d0, d2), d9 = Math.sin(d8), d10 = Math.cos(d8);
        const d11 = Math.atan2(Math.sqrt(d0 * d0 + d2 * d2), d1), d12 = Math.sin(d11), d13 = Math.cos(d11);
        const d14 = r.nextDouble() * Math.PI * 2, d15 = Math.sin(d14), d16 = Math.cos(d14);
        const q = [];
        for (let k = 0; k < 4; k++) {
          const d18 = ((k & 2) - 1) * d3, d19 = (((k + 1) & 2) - 1) * d3;
          const d21 = d18 * d16 - d19 * d15, d22 = d19 * d16 + d18 * d15;
          const d23 = d21 * d12, d24 = -d21 * d13;
          const d25 = d24 * d9 - d22 * d10, d26 = d22 * d9 + d24 * d10;
          q.push([d5 + d25, d6 + d23, d7 + d26]);
        }
        for (const idx of [0, 1, 2, 0, 2, 3]) sv.push(...q[idx], 1, 1, 1, 1);
      }
    }
    this.stars = this.vao(new Float32Array(sv), [3, 4]);
    this.starCount = sv.length / 7;
    this.fan = this.vao(new Float32Array(18 * 7), [3, 4], true);
    this.quad = this.vao(new Float32Array([-1, 0, -1, 0, 0, 1, 0, -1, 1, 0, 1, 1, 1, 0, 1, 0, -1, 1, 0]), [3, 2]);
  }
  vao(data, sizes, dynamic) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const stride = sizes.reduce((a, b) => a + b, 0) * 4;
    let off = 0;
    sizes.forEach((s, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, s, gl.FLOAT, false, stride, off); off += s * 4; });
    gl.bindVertexArray(null);
    return { vao, buf: b, count: data.length / (stride / 4) };
  }

  // env: { view (rotation only), proj, skyColor[3], fogColor[3], fogEnd, timeOfDay (0..1 celestial angle), sunrise (array|null), rain, starBrightness, moonPhase, cameraBelowHorizon }
  render(env) {
    const gl = this.gl;
    const vp = mat4.multiply(mat4.create(), env.proj, env.view);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    const pc = this.pc.use();
    pc.set('u_mvp', vp).set('u_model', mat4.create()).set('u_color', [...env.skyColor, 1]).set('u_fogColor', [...env.fogColor, 1]).set('u_fog', 0, env.fogEnd).set('u_useFog', 1);
    gl.bindVertexArray(this.skyDisc.vao); gl.drawArrays(gl.TRIANGLE_FAN, 0, this.skyDisc.count);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);
    pc.set('u_useFog', 0);
    if (env.sunrise) {
      const s = env.sunrise;
      const m = mat4.create();
      mat4.rotateX(m, m, Math.PI / 2);
      mat4.rotateZ(m, m, (Math.sin(env.sunAngle) < 0 ? Math.PI : 0));
      mat4.rotateZ(m, m, Math.PI / 2);
      const v = [0, 100, 0, s[0], s[1], s[2], s[3]];
      for (let j = 0; j <= 16; j++) {
        const a = j * Math.PI * 2 / 16, sa = Math.sin(a), ca = Math.cos(a);
        v.push(sa * 120, ca * 120, -ca * 40 * s[3], s[0], s[1], s[2], 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fan.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(v));
      pc.set('u_mvp', mat4.multiply(mat4.create(), vp, m)).set('u_color', [1, 1, 1, 1]);
      gl.bindVertexArray(this.fan.vao); gl.drawArrays(gl.TRIANGLE_FAN, 0, 18);
    }
    // sun & moon & stars rotate with time
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ZERO);
    const rot = mat4.create();
    mat4.rotateY(rot, rot, -Math.PI / 2);
    mat4.rotateX(rot, rot, env.timeOfDay * Math.PI * 2);
    const alpha = 1 - env.rain;
    const pt = this.pt.use();
    const sunM = mat4.multiply(mat4.create(), vp, rot);
    mat4.translate(sunM, sunM, [0, 100, 0]); mat4.scale(sunM, sunM, [30, 1, 30]);
    pt.set('u_mvp', sunM).set('u_color', 1, 1, 1, alpha).set('u_uvRect', 0, 0, 1, 1).tex('u_tex', this.sunTex);
    gl.bindVertexArray(this.quad.vao); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    const moonM = mat4.multiply(mat4.create(), vp, rot);
    mat4.translate(moonM, moonM, [0, -100, 0]); mat4.rotateX(moonM, moonM, Math.PI); mat4.scale(moonM, moonM, [20, 1, 20]);
    const ph = env.moonPhase;
    pt.set('u_mvp', moonM).set('u_uvRect', (ph % 4) / 4, Math.floor(ph / 4) / 2, 0.25, 0.5).tex('u_tex', this.moonTex);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    if (env.starBrightness > 0) {
      const b = env.starBrightness;
      pc.use().set('u_mvp', mat4.multiply(mat4.create(), vp, rot)).set('u_color', b, b, b, b).set('u_useFog', 0);
      gl.bindVertexArray(this.stars.vao); gl.drawArrays(gl.TRIANGLES, 0, this.starCount);
    }
    gl.disable(gl.BLEND);
    if (env.cameraBelowHorizon) {
      const m = mat4.create(); mat4.translate(m, m, [0, 12, 0]);
      pc.use().set('u_mvp', mat4.multiply(mat4.create(), vp, m)).set('u_color', 0, 0, 0, 1).set('u_useFog', 0);
      gl.bindVertexArray(this.darkDisc.vao); gl.drawArrays(gl.TRIANGLE_FAN, 0, this.darkDisc.count);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  }
}

// ------------------------------------------------------------------------------------------------------
// Physical sky (shader mode)
const LUT_FS = `
${ATMOSPHERE}
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
uniform float u_camAlt;
uniform float u_rain;
in vec2 v_uv; out vec4 o;
vec3 integrate(vec3 ro, vec3 rd, vec3 L, float Lint){
  vec2 top = raySphere(ro, rd, R_TOP);
  vec2 gnd = raySphere(ro, rd, R_GROUND);
  float tMax = top.y;
  if (gnd.x > 0.0) tMax = gnd.x;
  const int N = 24;
  float cosT = dot(rd, L);
  float pr = phaseR(cosT), pm = phaseM(cosT, 0.76);
  vec3 sum = vec3(0.0), T = vec3(1.0);
  float prevT = 0.0;
  for (int i = 0; i < N; i++){
    float t = tMax * pow((float(i) + 0.5) / float(N), 1.6);
    float dt = t - prevT; prevT = t;
    vec3 p = ro + rd * t;
    float h = length(p) - R_GROUND;
    vec3 rs; float ms;
    vec3 ext = extinctionAt(h, rs, ms);
    vec3 Ts = transmittanceTo(p, L);
    vec3 scat = (rs * pr + ms * pm) * Ts;
    // cheap multiple scattering approximation
    vec3 ms2 = (rs + ms) * 0.25 * (Ts * 0.6 + 0.08) * (0.3 + 0.7 * clamp(L.y * 4.0 + 0.5, 0.0, 1.0));
    vec3 sampleT = exp(-ext * dt);
    vec3 S = (scat + ms2) * Lint;
    sum += T * (S - S * sampleT) / max(ext, vec3(1e-9));
    T *= sampleT;
  }
  return sum;
}
void main(){
  float az = (v_uv.x - 0.5) * 6.2831853;
  float vv = v_uv.y * 2.0 - 1.0;
  float el = sign(vv) * vv * vv * 1.5707963;
  vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 ro = vec3(0.0, R_GROUND + max(u_camAlt, 1.0), 0.0);
  vec3 c = integrate(ro, rd, u_sunDir, 22.0);
  c += integrate(ro, rd, u_moonDir, 22.0 * 0.0025) * vec3(0.7, 0.85, 1.25);
  // overcast: desaturate & darken
  float g = dot(c, vec3(0.3, 0.5, 0.2));
  c = mix(c, vec3(g) * vec3(0.95, 1.0, 1.08), u_rain * 0.75) * (1.0 - u_rain * 0.45);
  o = vec4(c, 1.0);
}`;

export const SKY_SAMPLE = `
vec3 sampleSkyLUT(sampler2D lut, vec3 d){
  float az = atan(d.z, d.x) / 6.2831853 + 0.5;
  float el = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963);
  return texture(lut, vec2(az, v)).rgb;
}
`;

const SKY_FS = `
${ATMOSPHERE}
${NOISE}
${SKY_SAMPLE}
uniform sampler2D u_lut;
uniform sampler2D u_moonTex;
uniform mat4 u_invViewProj;
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
uniform vec3 u_sunColor;
uniform float u_starBright;
uniform float u_time;
uniform float u_rain;
uniform vec4 u_moonUV;
uniform float u_camY;
uniform mat3 u_starRot;
in vec2 v_uv; out vec4 o;
vec3 starField(vec3 d){
  vec3 sd = u_starRot * d;
  vec3 p = sd * 260.0;
  vec3 c = floor(p);
  float h = hash13(c);
  if (h < 0.986) return vec3(0.0);
  vec3 f = fract(p) - 0.5;
  float r = length(f);
  float b = smoothstep(0.35, 0.0, r) * pow((h - 0.986) / 0.014, 3.0);
  float tw = 0.7 + 0.3 * sin(u_time * 3.0 + h * 1000.0);
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash13(c + 7.0));
  // faint milky way band
  return tint * b * tw * 3.0;
}
void main(){
  vec4 ndc = vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = u_invViewProj * ndc;
  vec3 d = normalize(wp.xyz / wp.w);
  vec3 col = sampleSkyLUT(u_lut, d);
  // below the horizon: continue the horizon haze (distant terrain/ocean beyond render distance)
  if (d.y < 0.0) {
    vec3 hz = sampleSkyLUT(u_lut, normalize(vec3(d.x, 0.0, d.z)));
    col = mix(hz, hz * 0.55, smoothstep(0.0, -0.35, d.y));
  }
  // sun disk
  float cs = dot(d, u_sunDir);
  float sunR = 0.9995;
  if (cs > sunR) {
    float x = clamp((cs - sunR) / (1.0 - sunR), 0.0, 1.0);
    float limb = 0.4 + 0.6 * pow(x, 0.4);
    col += u_sunColor * 600.0 * limb * (1.0 - u_rain) * smoothstep(-0.02, 0.01, d.y);
  }
  // moon
  float cm = dot(d, u_moonDir);
  if (cm > 0.998) {
    vec3 up = abs(u_moonDir.y) > 0.99 ? vec3(1,0,0) : vec3(0,1,0);
    vec3 tx = normalize(cross(up, u_moonDir)), ty = cross(u_moonDir, tx);
    vec2 uv = vec2(dot(d, tx), dot(d, ty)) / 0.06 + 0.5;
    if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
      vec4 m = texture(u_moonTex, u_moonUV.xy + uv * u_moonUV.zw);
      col += srgbToLinearM(m.rgb) * m.a * 3.0 * (1.0 - u_rain);
    }
  }
  // stars
  if (u_starBright > 0.0 && d.y > 0.0) col += starField(d) * u_starBright * (1.0 - u_rain);
  o = vec4(col, 1.0);
}`.replace('vec3 starField', 'vec3 srgbToLinearM(vec3 c){ return pow(c, vec3(2.2)); }\nvec3 starField');

export class PhysicalSky {
  constructor(gl, vao) {
    this.gl = gl; this.vao = vao;
    this.lutProg = new Program(gl, FULLSCREEN_VS, LUT_FS, 'skyLUT');
    this.skyProg = new Program(gl, FULLSCREEN_VS, SKY_FS, 'sky');
    this.lut = new RenderTarget(gl, 192, 108, [{ internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }]);
    gl.bindTexture(gl.TEXTURE_2D, this.lut.colors[0].tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    const { moon } = paintSunMoon();
    this.moonTex = createTexture(gl, 128, 64, { data: moon, filter: gl.NEAREST });
  }
  updateLUT(env) {
    const gl = this.gl;
    this.lut.bind();
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    this.lutProg.use().set('u_sunDir', env.sunDir).set('u_moonDir', env.moonDir).set('u_camAlt', 400 + Math.max(0, env.camY - 63) * 2).set('u_rain', env.rain);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  render(env) {
    const gl = this.gl;
    const p = this.skyProg.use();
    const ph = env.moonPhase;
    p.set('u_invViewProj', env.invViewProj).set('u_sunDir', env.sunDir).set('u_moonDir', env.moonDir).set('u_sunColor', env.sunColor)
      .set('u_starBright', env.starBrightness).set('u_time', env.time).set('u_rain', env.rain).set('u_moonUV', (ph % 4) / 4, Math.floor(ph / 4) / 2, 0.25, 0.5)
      .set('u_starRot', env.starRot).tex('u_lut', this.lut.colors[0]).tex('u_moonTex', this.moonTex);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
  }
}
