// Entity model rendering (box models), dropped items, held items and the first-person hand.
import { Program, createTexture } from '../engine/gl.js';
import { mat4 } from '../engine/math.js';
import { MODELS, boxFaces, partMatrices } from '../entity/models.js';
import { paintEntityTextures } from '../entity/skins.js';
import { TONEMAP, NOISE } from './shaders/common.js';
import { LIGHTING } from './shaders/terrain.js';
import { ITEMS } from '../game/items.js';
import { GBUF_ENTITY_FS } from './shaders/deferred.js';

const ENT_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec3 a_nrm;
layout(location=3) in float a_part;
uniform mat4 u_parts[24];
uniform mat4 u_model;
uniform mat4 u_viewProj;
uniform vec2 u_jitter;
out vec2 v_uv; out vec3 v_nrm; out vec3 v_rel;
void main(){
  mat4 m = u_model * u_parts[int(a_part + 0.5)];
  vec4 wp = m * vec4(a_pos / 16.0, 1.0);
  v_rel = wp.xyz;
  v_nrm = normalize(mat3(m) * a_nrm);
  v_uv = a_uv;
  vec4 cp = u_viewProj * wp;
  cp.xy += u_jitter * cp.w;
  gl_Position = cp;
}`;

const ENT_VANILLA_FS = `
uniform sampler2D u_tex;
uniform vec3 u_light;       // lightmap color for the entity position
uniform vec4 u_overlay;     // rgb overlay color, a = mix amount (hurt red / creeper flash)
uniform vec4 u_fogColor; uniform vec2 u_fog;
uniform vec4 u_tint;
in vec2 v_uv; in vec3 v_nrm; in vec3 v_rel;
out vec4 o;
void main(){
  vec4 c = texture(u_tex, v_uv);
  if (c.a < 0.1) discard;
  c *= u_tint;
  c.rgb = mix(c.rgb, u_overlay.rgb, u_overlay.a);
  vec3 n = normalize(v_nrm);
  vec3 l0 = normalize(vec3(0.2, 1.0, -0.7)), l1 = normalize(vec3(-0.2, 1.0, 0.7));
  float la = min(1.0, (max(0.0, dot(l0, n)) + max(0.0, dot(l1, n))) * 0.6 + 0.4);
  c.rgb *= la * u_light;
  float d = max(length(v_rel.xz), abs(v_rel.y));
  float f = d <= u_fog.x ? 0.0 : (d < u_fog.y ? smoothstep(u_fog.x, u_fog.y, d) : 1.0);
  c.rgb = mix(c.rgb, u_fogColor.rgb, f * u_fogColor.a);
  o = vec4(c.rgb, 1.0);
}`;

const ENT_PBR_FS = `
${NOISE}
${TONEMAP}
${LIGHTING}
uniform sampler2D u_tex;
uniform vec2 u_lightLevels;  // sky, block 0..1
uniform vec4 u_overlay;
uniform vec4 u_tint;
uniform float u_emissive;
in vec2 v_uv; in vec3 v_nrm; in vec3 v_rel;
layout(location=0) out vec4 o_color;
layout(location=1) out vec4 o_normal;
void main(){
  vec4 c = texture(u_tex, v_uv);
  if (c.a < 0.1) discard;
  c *= u_tint;
  c.rgb = mix(c.rgb, u_overlay.rgb, u_overlay.a);
  vec3 albedo = srgbToLinear(c.rgb);
  vec3 N = normalize(v_nrm);
  if (!gl_FrontFacing) N = -N;
  float noise = ign(gl_FragCoord.xy + u_frame * 5.588);
  float NdotL = dot(N, u_lightDir);
  float inRange;
  float sh = shadowLookup(v_rel, N, NdotL, noise, inRange);
  if (inRange < 0.5) sh *= smoothstep(0.8, 0.97, u_lightLevels.x);
  vec3 direct = u_lightColor * sh * max(NdotL, 0.0);
  float sky = u_lightLevels.x;
  vec3 amb = skyAmbient(N) * sky * sky * sky + vec3(0.01) * u_caveAmbient + u_nightVision * 0.5;
  float bl = u_lightLevels.y;
  vec3 torch = u_torchColor * (pow(bl, 4.0) * 3.2 + pow(bl, 1.8) * 0.12);
  vec3 col = albedo * (direct + amb + torch) + albedo * u_emissive * 6.0;
  o_color = vec4(col, 1.0);
  o_normal = vec4(N * 0.5 + 0.5, 0.15);
}`;

const ENT_SHADOW_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=3) in float a_part;
const float SHADOW_DISTORT = 0.88;
uniform mat4 u_parts[24];
uniform mat4 u_model;
uniform mat4 u_shadowMat;
out vec2 v_uv;
void main(){
  vec4 wp = u_model * u_parts[int(a_part + 0.5)] * vec4(a_pos / 16.0, 1.0);
  vec4 p = u_shadowMat * wp;
  float d = length(p.xy); float f = d * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
  gl_Position = vec4(p.xy / f, p.z * 0.2, 1.0);
  v_uv = a_uv;
}`;
const ENT_SHADOW_FS = `
uniform sampler2D u_tex; in vec2 v_uv;
void main(){ if (texture(u_tex, v_uv).a < 0.1) discard; }`;

export class EntityRenderer {
  constructor(renderer, itemMeshes) {
    this.r = renderer;
    const gl = this.gl = renderer.gl;
    this.items = itemMeshes;
    this.progV = new Program(gl, ENT_VS, ENT_VANILLA_FS, 'entity');
    this.progP = new Program(gl, ENT_VS, ENT_PBR_FS, 'entityPBR');
    this.progS = new Program(gl, ENT_SHADOW_VS, ENT_SHADOW_FS, 'entityShadow');
    this.progG = new Program(gl, ENT_VS, GBUF_ENTITY_FS, 'entityGbuf');
    const tex = paintEntityTextures();
    this.textures = {};
    for (const [n, t] of Object.entries(tex)) this.textures[n] = createTexture(gl, t.w, t.h, { data: new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.length), filter: gl.NEAREST });
    this.models = {};
    for (const [name, m] of Object.entries(MODELS)) this.models[name] = this.buildModel(m);
    this.armModel = this.buildArm();
    this.partBuf = new Float32Array(24 * 16);
  }

  buildModel(m) {
    const gl = this.gl;
    const verts = [];
    const partIndex = {};
    m.parts.forEach((p, i) => { partIndex[p.name] = i; });
    m.parts.forEach((p, pi) => {
      for (const c of p.cubes) {
        for (const f of boxFaces(c)) {
          for (const k of [0, 1, 2, 0, 2, 3]) {
            const q = f.corners[k], uv = f.uvs[k];
            verts.push(q[0], q[1], q[2], uv[0] / m.texW, uv[1] / m.texH, f.normal[0], f.normal[1], f.normal[2], pi);
          }
        }
      }
    });
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindVertexArray(null);
    return { def: m, vao, count: verts.length / 9, partIndex };
  }

  // right arm (+ sleeve) converted into Java ModelPart space for the first-person transforms
  buildArm() {
    const m = MODELS.player;
    const verts = [];
    for (const pn of ['right_arm', 'right_sleeve']) {
      const p = m.parts.find(q => q.name === pn);
      if (!p) continue;
      for (const c of p.cubes) for (const f of boxFaces(c)) for (const k of [0, 2, 1, 0, 3, 2]) {
        const q = f.corners[k], uv = f.uvs[k];
        // agent space -> Java space: (x, 24 - y, -z)
        verts.push(q[0], 24 - q[1], -q[2], uv[0] / m.texW, uv[1] / m.texH, f.normal[0], -f.normal[1], -f.normal[2], 0);
      }
    }
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindVertexArray(null);
    return { vao, count: verts.length / 9 };
  }

  // ctx: {mode: 'vanilla'|'pbr'|'shadow', viewProj, env, lightmap fn, ...}
  begin(ctx) {
    const gl = this.gl;
    this.ctx = ctx;
    let p;
    if (ctx.pass === 'shadow') { p = this.progS.use(); p.set('u_shadowMat', ctx.shadowMat); }
    else if (ctx.mode === 'pbr' && ctx.gbuffer) { p = this.progG.use(); p.set('u_viewProj', ctx.viewProj).set('u_jitter', ctx.jitter || [0, 0]); }
    else if (ctx.mode === 'pbr') { p = this.progP.use(); ctx.setLighting(p); p.set('u_viewProj', ctx.viewProj).set('u_jitter', ctx.jitter || [0, 0]); }
    else { p = this.progV.use(); p.set('u_viewProj', ctx.viewProj).set('u_fogColor', [...ctx.env.fogColor, 1]).set('u_fog', ctx.env.fogStart, ctx.env.fogEnd).set('u_jitter', 0, 0); }
    this.prog = p;
    gl.disable(gl.CULL_FACE);
  }
  end() { this.gl.enable(this.gl.CULL_FACE); }

  // draw a box model. e: {model, texture, pose, pos(camera-relative), yaw, scale, light:[sky,block], overlay, tint}
  drawModel(name, inst) {
    const gl = this.gl;
    const M = this.models[name];
    if (!M) return;
    const p = this.prog;
    const mats = partMatrices(M.def, inst.pose || {});
    M.def.parts.forEach((part, i) => this.partBuf.set(mats[part.name], i * 16));
    p.set('u_parts', this.partBuf);
    const model = mat4.create();
    mat4.translate(model, model, inst.pos);
    mat4.rotateY(model, model, -(inst.yaw || 0) * Math.PI / 180);
    if (inst.pitch) mat4.rotateX(model, model, inst.pitch * Math.PI / 180);
    if (inst.roll) mat4.rotateZ(model, model, inst.roll * Math.PI / 180);
    if (inst.preTransform) mat4.multiply(model, model, inst.preTransform);
    const s = (inst.scale || 1) * (M.def.scale || 1);
    if (s !== 1) mat4.scale(model, model, [s, s, s]);
    p.set('u_model', model);
    p.tex('u_tex', this.textures[inst.texture || M.def.texture]);
    if (this.ctx.pass !== 'shadow') {
      const [sky, blk] = inst.light || [15, 0];
      if (this.ctx.mode === 'pbr') p.set('u_lightLevels', sky / 15, blk / 15).set('u_emissive', inst.emissive || 0);
      else p.set('u_light', this.ctx.lightmap(sky, blk));
      p.set('u_overlay', inst.overlay || [0, 0, 0, 0]).set('u_tint', inst.tint || [1, 1, 1, 1]);
    }
    gl.bindVertexArray(M.vao);
    gl.drawArrays(gl.TRIANGLES, 0, M.count);
    gl.bindVertexArray(null);
  }

  // First-person arm drawn with a matrix in camera space (Java pose stack)
  drawArm(poseMatrix, light, viewProjHand, skin = 'player') {
    const gl = this.gl;
    const p = this.prog;
    const id = mat4.create();
    this.partBuf.set(id, 0);
    p.set('u_parts', this.partBuf).set('u_model', poseMatrix).set('u_viewProj', viewProjHand);
    p.tex('u_tex', this.textures[skin]);
    if (this.ctx.mode === 'pbr') p.set('u_lightLevels', light[0] / 15, light[1] / 15).set('u_emissive', 0);
    else p.set('u_light', this.ctx.lightmap(light[0], light[1]));
    p.set('u_overlay', [0, 0, 0, 0]).set('u_tint', [1, 1, 1, 1]);
    gl.bindVertexArray(this.armModel.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.armModel.count);
    gl.bindVertexArray(null);
  }
}

// ---- Java-style pose stack helpers ------------------------------------------------------------------
export class PoseStack {
  constructor(m) { this.m = m ? Float32Array.from(m) : mat4.create(); this.stack = []; }
  push() { this.stack.push(Float32Array.from(this.m)); }
  pop() { this.m = this.stack.pop(); }
  translate(x, y, z) { mat4.translate(this.m, this.m, [x, y, z]); }
  scale(x, y, z) { mat4.scale(this.m, this.m, [x, y, z]); }
  rotX(d) { mat4.rotateX(this.m, this.m, d * Math.PI / 180); }
  rotY(d) { mat4.rotateY(this.m, this.m, d * Math.PI / 180); }
  rotZ(d) { mat4.rotateZ(this.m, this.m, d * Math.PI / 180); }
}

export function itemDisplayKind(id) {
  const it = ITEMS[id];
  if (!it) return 'none';
  if (it.icon && it.icon.type === 'block') return 'block';
  if (it.tool || ['stick', 'bow', 'fishing_rod'].includes(it.name)) return 'handheld';
  return 'generated';
}
