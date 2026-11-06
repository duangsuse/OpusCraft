// Item icons for the GUI: block items are rendered in 3D (vanilla "gui" display transform: rot [30,225,0], scale 0.625)
// via WebGL into small canvases; flat items copy their 16x16 sprite.
import { Program, RenderTarget } from '../engine/gl.js';
import { mat4 } from '../engine/math.js';
import { ITEMS } from '../game/items.js';
import { BLOCKS } from '../world/blocks.js';
import { TERRAIN_ATTRIBS } from '../render/shaders/common.js';

const VS = `
${TERRAIN_ATTRIBS}
uniform mat4 u_mvp;
out vec2 v_uv; flat out float v_layer; out vec3 v_tint; flat out int v_flags; out float v_shade;
void main(){
  gl_Position = u_mvp * vec4(a_pos.xyz / 16.0, 1.0);
  v_uv = a_uv / 4096.0; v_layer = a_pos.w; v_tint = a_color.rgb; v_flags = int(a_light.w * 255.0 + 0.5);
  vec3 n = a_nrm.xyz / 127.0;
  v_shade = n.y > 0.5 ? 1.0 : n.y < -0.5 ? 0.5 : abs(n.x) > 0.5 ? 0.8 : abs(n.z) > 0.5 ? 0.6 : 1.0;
}`;
const FS = `
uniform sampler2DArray u_albedo; uniform float u_overlayLayer;
in vec2 v_uv; flat in float v_layer; in vec3 v_tint; flat in int v_flags; in float v_shade;
out vec4 o;
void main(){
  vec4 t = texture(u_albedo, vec3(v_uv, v_layer));
  if (t.a < 0.1) discard;
  vec3 c = t.rgb;
  if ((v_flags & 1) != 0) { vec4 ov = texture(u_albedo, vec3(v_uv, u_overlayLayer)); c = mix(c, ov.rgb * v_tint, ov.a); } else c *= v_tint;
  o = vec4(c * v_shade, 1.0);
}`;

export class IconCache {
  constructor(renderer, itemMeshes) {
    this.r = renderer; this.items = itemMeshes;
    const gl = this.gl = renderer.gl;
    this.prog = new Program(gl, VS, FS, 'icons');
    this.cache = new Map();
    this.scale = 0;
    this.rt = null;
  }
  setScale(s) {
    if (s === this.scale) return;
    this.scale = s;
    this.cache.clear();
    const n = 16 * s;
    if (this.rt) this.rt.dispose();
    this.rt = new RenderTarget(this.gl, n, n, [{}], { internal: this.gl.DEPTH_COMPONENT24, type: this.gl.UNSIGNED_INT });
  }
  get(id) {
    let c = this.cache.get(id);
    if (c) return c;
    c = this.render(id);
    this.cache.set(id, c);
    return c;
  }
  render(id) {
    const it = ITEMS[id];
    const n = 16 * this.scale;
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!it) return canvas;
    const icon = it.icon || { type: 'block' };
    if (icon.type !== 'block' || it.block === undefined) {
      const layerName = icon.type === 'item' ? 'item/' + icon.tex : icon.tex;
      const td = this.r.atlas.texData[layerName];
      if (!td) return canvas;
      const src = td.frames[0];
      const b = it.block !== undefined ? BLOCKS[it.block] : null;
      const tint = b && b.tint === 'grass' ? 0x91bd59 : b && b.tint === 'foliage' ? 0x48b518 : b && b.tint === 'lily' ? 0x71c35c : 0xffffff;
      const img = ctx.createImageData(16, 16);
      for (let i = 0; i < 256; i++) {
        img.data[i * 4] = src[i * 4] * ((tint >> 16) & 255) / 255; img.data[i * 4 + 1] = src[i * 4 + 1] * ((tint >> 8) & 255) / 255;
        img.data[i * 4 + 2] = src[i * 4 + 2] * (tint & 255) / 255; img.data[i * 4 + 3] = src[i * 4 + 3];
      }
      const tmp = document.createElement('canvas'); tmp.width = 16; tmp.height = 16;
      tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, n, n);
      return canvas;
    }
    // 3D block icon
    const gl = this.gl;
    const b = BLOCKS[it.block];
    let v = it.block;
    if (b.facing) v |= 0; // front faces north (shows on the right face like vanilla)
    if (b.model === 'stairs') v |= (3 << 12);
    if (b.model === 'torch') v = it.block;
    const mesh = this.items.block(v, { both: true });
    this.rt.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    const m = mat4.ortho(mat4.create(), -8, 8, -8, 8, -100, 100);
    mat4.rotateX(m, m, 30 * Math.PI / 180);
    mat4.rotateY(m, m, 225 * Math.PI / 180);
    let sc = 16 * 0.625;
    mat4.scale(m, m, [sc, sc, sc]);
    const tall = b.model === 'double_plant' || b.model === 'door';
    if (tall) mat4.scale(m, m, [0.5, 0.5, 0.5]);
    mat4.translate(m, m, [-0.5, tall ? -1 : -0.5, -0.5]);
    this.prog.use().set('u_mvp', m).set('u_overlayLayer', this.r.atlas.layers.grass_block_side_overlay ?? 0).tex('u_albedo', this.r.atlas.albedo);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.quads * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.CULL_FACE);
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) img.data.set(px.subarray((n - 1 - y) * n * 4, (n - y) * n * 4), y * n * 4);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}
