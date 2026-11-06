// Particle system: terrain break/hit particles, smoke, flames, splashes, bubbles, rain splashes, explosions, etc.
// Particles are billboards sampling either a block texture region or a procedural sprite layer.
import { Program } from '../engine/gl.js';
import { mat4 } from '../engine/math.js';
import { BLOCKS, TYPE_MASK, T_SOLID, T_FLUID } from '../world/blocks.js';
import { NOISE, TONEMAP } from './shaders/common.js';

const VS = `
layout(location=0) in vec3 a_pos;   // camera-relative center
layout(location=1) in vec4 a_uvr;   // u0,v0,u1,v1
layout(location=2) in vec4 a_col;   // rgba
layout(location=3) in vec3 a_misc;  // size, layer, corner index
layout(location=4) in vec2 a_light; // sky, block 0..1
uniform mat4 u_viewProj; uniform vec3 u_right; uniform vec3 u_up; uniform vec2 u_jitter;
out vec2 v_uv; flat out float v_layer; out vec4 v_col; out vec2 v_light; out vec3 v_rel;
void main(){
  int c = int(a_misc.z + 0.5);
  vec2 o = vec2(c == 0 || c == 3 ? -1.0 : 1.0, c < 2 ? 1.0 : -1.0);
  vec3 p = a_pos + (u_right * o.x + u_up * o.y) * a_misc.x;
  v_uv = vec2(o.x < 0.0 ? a_uvr.x : a_uvr.z, o.y > 0.0 ? a_uvr.y : a_uvr.w);
  v_layer = a_misc.y; v_col = a_col; v_light = a_light; v_rel = p;
  vec4 cp = u_viewProj * vec4(p, 1.0); cp.xy += u_jitter * cp.w; gl_Position = cp;
}`;
const FS_V = `
uniform sampler2DArray u_albedo; uniform sampler2D u_lightmap; uniform vec4 u_fogColor; uniform vec2 u_fog;
in vec2 v_uv; flat in float v_layer; in vec4 v_col; in vec2 v_light; in vec3 v_rel; out vec4 o;
void main(){
  vec4 t = texture(u_albedo, vec3(v_uv, v_layer)) * v_col;
  if (t.a < 0.1) discard;
  vec3 lm = v_light.x < 0.0 ? vec3(1.0) : texture(u_lightmap, (vec2(v_light.y, v_light.x) * 15.0 + 0.5) / 16.0).rgb;
  vec3 c = t.rgb * lm;
  float d = max(length(v_rel.xz), abs(v_rel.y));
  float f = d <= u_fog.x ? 0.0 : (d < u_fog.y ? smoothstep(u_fog.x, u_fog.y, d) : 1.0);
  o = vec4(mix(c, u_fogColor.rgb, f), t.a);
}`;
const FS_P = `
${TONEMAP}
uniform sampler2DArray u_albedo; uniform vec3 u_ambUp; uniform vec3 u_lightColor; uniform vec3 u_torchColor;
in vec2 v_uv; flat in float v_layer; in vec4 v_col; in vec2 v_light; in vec3 v_rel;
layout(location=0) out vec4 o; layout(location=1) out vec4 o_n;
void main(){
  vec4 t = texture(u_albedo, vec3(v_uv, v_layer)) * v_col;
  if (t.a < 0.1) discard;
  vec3 alb = srgbToLinear(t.rgb);
  vec3 c;
  if (v_light.x < 0.0) c = alb * 4.0;
  else { float s = v_light.x; c = alb * (u_ambUp * s * s * s * 1.2 + u_lightColor * 0.5 * s * s + u_torchColor * pow(v_light.y, 4.0) * 3.0 + 0.004); }
  o = vec4(c, 1.0); o_n = vec4(0.5, 1.0, 0.5, 0.1);
}`;

const MAX = 8192;
export class Particles {
  constructor(renderer, game) {
    this.r = renderer; this.game = game;
    const gl = this.gl = renderer.gl;
    this.progV = new Program(gl, VS, FS_V, 'particles');
    this.progP = new Program(gl, VS, FS_P, 'particlesPBR');
    this.list = [];
    this.data = new Float32Array(MAX * 6 * 16);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const st = 16 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, st, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 28);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, st, 44);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, st, 56);
    gl.bindVertexArray(null);
    this.layers = renderer.atlas.layers;
  }
  add(p) { if (this.list.length < MAX) this.list.push(p); return p; }

  // TerrainParticle from block destruction (ParticleEngine.destroy)
  destroy(x, y, z, v) {
    const b = BLOCKS[v & TYPE_MASK];
    if (!b.texFaces) return;
    const layer = this.layers[b.texFaces[2]] ?? this.layers[b.texFaces[0]];
    const tint = this.tintOf(b, x, z);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
      const px = (i + 0.5) / 4, py = (j + 0.5) / 4, pz = (k + 0.5) / 4;
      this.terrain(x + px, y + py, z + pz, px - 0.5, py - 0.5, pz - 0.5, layer, tint);
    }
  }
  terrain(x, y, z, vx, vy, vz, layer, tint) {
    const uo = Math.random() * 3, vo = Math.random() * 3;
    const sp = (Math.random() + Math.random() + 1) * 0.15;
    let dx = vx + (Math.random() * 2 - 1) * 0.4, dy = vy + (Math.random() * 2 - 1) * 0.4, dz = vz + (Math.random() * 2 - 1) * 0.4;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l * sp * 0.4; dy = dy / l * sp * 0.4 + 0.1; dz = dz / l * sp * 0.4;
    const g = 0.6;
    this.add({
      x, y, z, vx: dx, vy: dy, vz: dz, life: 4 / (Math.random() * 0.9 + 0.1) | 0, age: 0, gravity: 1, size: 0.1 * (Math.random() * 0.5 + 0.5),
      layer, u0: (uo + 1) / 4, v0: vo / 4, u1: uo / 4, v1: (vo + 1) / 4, col: [((tint >> 16) & 255) / 255 * g, ((tint >> 8) & 255) / 255 * g, (tint & 255) / 255 * g, 1], physics: true, friction: 0.98,
    });
  }
  tintOf(b, x, z) {
    if (b.tint === 'grass' || b.tint === 'foliage') {
      const bi = this.game.world.biomeAt(Math.floor(x), Math.floor(z));
      const bd = this.game.biomes[bi] || {};
      return b.tint === 'grass' ? (bd.grassColor ?? 0x91bd59) : (bd.foliageColor ?? 0x77ab2f);
    }
    if (b.tint === 'spruce') return 0x619961; if (b.tint === 'birch') return 0x80a755;
    return 0xffffff;
  }
  // block hit particle on a face (ParticleEngine.crack)
  crack(x, y, z, face, v) {
    const b = BLOCKS[v & TYPE_MASK];
    if (!b.texFaces || b.model === 'fluid') return;
    const e = 0.1;
    let px = x + Math.random() * (1 - e * 2) + e, py = y + Math.random() * (1 - e * 2) + e, pz = z + Math.random() * (1 - e * 2) + e;
    if (face === 0) py = y - e; if (face === 1) py = y + 1 + e; if (face === 2) pz = z - e; if (face === 3) pz = z + 1 + e; if (face === 4) px = x - e; if (face === 5) px = x + 1 + e;
    const layer = this.layers[b.texFaces[face]] ?? 0;
    this.terrain(px, py, pz, 0, 0, 0, layer, this.tintOf(b, x, z));
    const p = this.list[this.list.length - 1];
    if (p) { p.vx *= 0.2; p.vy = (p.vy - 0.1) * 0.2 + 0.1; p.vz *= 0.2; p.size *= 0.6; }
  }
  // generic sprite particles using block textures as stand-ins for vanilla particle sheet sprites
  spawn(kind, x, y, z, vx = 0, vy = 0, vz = 0) {
    const L = this.layers;
    const base = { x, y, z, vx, vy, vz, age: 0, physics: false, friction: 0.96, gravity: 0, u0: 0, v0: 0, u1: 1, v1: 1 };
    switch (kind) {
      case 'smoke': return this.add({ ...base, layer: L.white_wool, col: [0.3, 0.3, 0.3, 1].map((c, i) => i < 3 ? Math.random() * 0.3 : 1), size: 0.08 + Math.random() * 0.06, life: 8 / (Math.random() * 0.8 + 0.2) | 0, vy: vy + 0.04, grow: 1.02, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 });
      case 'large_smoke': return this.add({ ...base, layer: L.white_wool, col: [0.15, 0.15, 0.15, 1], size: 0.3 + Math.random() * 0.2, life: 16 + Math.random() * 20 | 0, vy: vy + 0.03, grow: 1.01, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 });
      case 'flame': return this.add({ ...base, layer: L.fire_0, col: [1, 1, 1, 1], size: 0.05, life: 8 + Math.random() * 4 | 0, emissive: true, u0: 0.3, v0: 0.6, u1: 0.7, v1: 1, shrink: true });
      case 'lava': return this.add({ ...base, layer: L.lava_still, col: [1, 1, 1, 1], size: 0.06, life: 16 / (Math.random() * 0.8 + 0.2) | 0, vx: (Math.random() - 0.5) * 0.1, vy: Math.random() * 0.4 + 0.05, vz: (Math.random() - 0.5) * 0.1, gravity: 0.75, physics: true, emissive: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'splash': return this.add({ ...base, layer: L.water_still, col: [0.2, 0.35, 0.9, 1], size: 0.04, life: 8 / (Math.random() * 0.8 + 0.2) | 0, vy: vy + Math.random() * 0.2 + 0.1, gravity: 0.6, physics: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'rain': return this.add({ ...base, layer: L.water_still, col: [0.3, 0.45, 0.95, 1], size: 0.03, life: 8 / (Math.random() * 0.8 + 0.2) | 0, vx: (Math.random() - 0.5) * 0.06, vy: Math.random() * 0.1 + 0.05, vz: (Math.random() - 0.5) * 0.06, gravity: 0.6, physics: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'bubble': return this.add({ ...base, layer: L.glass, col: [0.85, 0.9, 1, 1], size: 0.03 + Math.random() * 0.02, life: 8 / (Math.random() * 0.8 + 0.2) | 0, vy: vy + 0.02, bubble: true, u0: 0, v0: 0, u1: 0.25, v1: 0.25 });
      case 'explosion': return this.add({ ...base, layer: L.white_wool, col: [0.9, 0.9, 0.9, 1].map((c, i) => i < 3 ? Math.random() * 0.4 + 0.6 : 1), size: 1.0 + Math.random(), life: 6 + Math.random() * 4 | 0, u0: 0.3, v0: 0.3, u1: 0.7, v1: 0.7, emissive: true, shrink: true });
      case 'crit': return this.add({ ...base, layer: L.white_wool, col: [0.9, 0.9, 1, 1], size: 0.05, life: 6 + Math.random() * 6 | 0, gravity: 0.5, physics: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'portal': return this.add({ ...base, layer: L.nether_portal, col: [0.8, 0.5, 1, 1], size: 0.05, life: 40 + Math.random() * 10 | 0, emissive: true, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 });
      case 'heart': return this.add({ ...base, layer: L.red_wool, col: [1, 0.3, 0.3, 1], size: 0.1, life: 16, vy: 0.05, u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 });
      case 'snow': return this.add({ ...base, layer: L.snow, col: [1, 1, 1, 1], size: 0.03, life: 20, gravity: 0.1, physics: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'drip': return this.add({ ...base, layer: L.water_still, col: [0.2, 0.3, 1, 1], size: 0.02, life: 40, gravity: 0.06, physics: true, u0: 0.4, v0: 0.4, u1: 0.5, v1: 0.5 });
      case 'eat': return null;
      default: return null;
    }
  }
  item(x, y, z, layerName, tint = 0xffffff) {
    const layer = this.layers[layerName] ?? 0;
    for (let i = 0; i < 5; i++) {
      const uo = Math.random() * 12 | 0, vo = Math.random() * 12 | 0;
      this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.1, vy: Math.random() * 0.1 + 0.1, vz: (Math.random() - 0.5) * 0.1, age: 0, life: 10 + Math.random() * 10 | 0, gravity: 1, physics: true, friction: 0.98, size: 0.05, layer, u0: uo / 16, v0: vo / 16, u1: (uo + 2) / 16, v1: (vo + 2) / 16, col: [((tint >> 16) & 255) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255, 1] });
    }
  }
  pickup(item, player) { item.pickedBy = player; }

  tick() {
    const w = this.game.world;
    const out = [];
    for (const p of this.list) {
      p.age++;
      if (p.age >= p.life) continue;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.vy -= 0.04 * p.gravity;
      if (p.bubble) { p.vy += 0.002; if (T_FLUID[w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) & TYPE_MASK] !== 1) continue; }
      let nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
      if (p.physics) {
        const v = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)) & TYPE_MASK;
        if (T_SOLID[v] && BLOCKS[v].model === 'cube') {
          if (Math.floor(ny) !== Math.floor(p.y) && p.vy < 0) { ny = Math.floor(p.y) + 0.001; p.vy = 0; p.onGround = true; }
          if (Math.floor(nx) !== Math.floor(p.x)) { nx = p.x; p.vx = 0; }
          if (Math.floor(nz) !== Math.floor(p.z)) { nz = p.z; p.vz = 0; }
        }
      }
      p.x = nx; p.y = ny; p.z = nz;
      p.vx *= p.friction; p.vy *= 0.98; p.vz *= p.friction;
      if (p.onGround) { p.vx *= 0.7; p.vz *= 0.7; }
      if (p.grow) p.size *= p.grow;
      out.push(p);
    }
    this.list = out;
  }

  render(gl, ctx) {
    if (!this.list.length) return;
    const pt = this.game.partialTick;
    const cam = ctx.cam;
    const d = this.data;
    let n = 0;
    const w = this.game.world;
    for (const p of this.list) {
      const x = (p.px ?? p.x) + (p.x - (p.px ?? p.x)) * pt - cam.pos[0];
      const y = (p.py ?? p.y) + (p.y - (p.py ?? p.y)) * pt - cam.pos[1];
      const z = (p.pz ?? p.z) + (p.z - (p.pz ?? p.z)) * pt - cam.pos[2];
      let size = p.size;
      if (p.shrink) size *= 1 - (p.age + pt) / p.life;
      let ls = -1, lb = 0;
      if (!p.emissive) { const L = w.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); ls = L[0] / 15; lb = L[1] / 15; }
      for (const c of [0, 1, 2, 2, 3, 0]) {
        const o = n * 16;
        d[o] = x; d[o + 1] = y; d[o + 2] = z;
        d[o + 3] = p.u0; d[o + 4] = p.v0; d[o + 5] = p.u1; d[o + 6] = p.v1;
        d[o + 7] = p.col[0]; d[o + 8] = p.col[1]; d[o + 9] = p.col[2]; d[o + 10] = p.col[3];
        d[o + 11] = size; d[o + 12] = p.layer ?? 0; d[o + 13] = c;
        d[o + 14] = ls; d[o + 15] = lb;
        n++;
      }
    }
    // camera basis from view matrix (rows)
    const v = cam.view;
    const right = [v[0], v[4], v[8]], up = [v[1], v[5], v[9]];
    const prog = ctx.mode === 'pbr' ? this.progP.use() : this.progV.use();
    prog.set('u_viewProj', ctx.viewProj).set('u_right', right).set('u_up', up).set('u_jitter', ctx.jitter || [0, 0]).tex('u_albedo', this.r.atlas.albedo);
    if (ctx.mode === 'pbr') prog.set('u_ambUp', ctx.env.ambUp).set('u_lightColor', ctx.env.lightColor).set('u_torchColor', [1.0, 0.55, 0.25]);
    else prog.tex('u_lightmap', this.r.lightmapTex).set('u_fogColor', [...ctx.env.fogColor, 1]).set('u_fog', ctx.env.fogStart, ctx.env.fogEnd);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 16);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    void mat4;
  }
}
void NOISE;
