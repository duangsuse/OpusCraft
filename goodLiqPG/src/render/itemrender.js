// GPU meshes for single blocks and extruded item sprites (terrain vertex format), used for held items,
// dropped items, falling blocks and inventory icons.
import { meshSingle, initMesher } from '../world/mesher.js';
import { ITEMS } from '../game/items.js';
import { BLOCKS, MAT } from '../world/blocks.js';

const FLAG_NOAO = 2;

export class ItemMeshes {
  constructor(gl, atlas, biomeColors, indexBuffer) {
    this.gl = gl; this.atlas = atlas; this.indexBuffer = indexBuffer;
    this.cache = new Map();
    initMesher(atlas.layers, biomeColors);
  }
  makeVAO(bytes) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.SHORT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, false, 24, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.BYTE, false, 24, 12);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 24, 16);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 24, 20);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }
  // block value -> mesh
  block(v, opts = {}) {
    const key = 'b' + v + (opts.both ? 'B' : '');
    let m = this.cache.get(key);
    if (m) return m;
    const r = meshSingle(v, opts);
    const { vao } = this.makeVAO(r.data);
    m = { vao, quads: r.count / 4, kind: 'block', layers: r.layers };
    this.cache.set(key, m);
    return m;
  }
  // extruded sprite from a texture-array layer name (item/<name> or a block texture)
  sprite(layerName, tint = 0xffffff) {
    const key = 's' + layerName + ':' + tint;
    let m = this.cache.get(key);
    if (m) return m;
    const layer = this.atlas.layers[layerName] ?? 0;
    const td = this.atlas.texData[layerName];
    const px = td ? td.frames[0] : new Uint8ClampedArray(1024).fill(255);
    const verts = [];
    const z0 = 7.5, z1 = 8.5;
    const r = (tint >> 16) & 255, g = (tint >> 8) & 255, b = tint & 255;
    const push = (x, y, z, u, v, nx, ny, nz) => verts.push([x, y, z, layer, u, v, nx, ny, nz]);
    // front (+z) and back (-z) full quads
    push(0, 16, z1, 0, 0, 0, 0, 127); push(0, 0, z1, 0, 1, 0, 0, 127); push(16, 0, z1, 1, 1, 0, 0, 127); push(16, 16, z1, 1, 0, 0, 0, 127);
    push(16, 16, z0, 1, 0, 0, 0, -127); push(16, 0, z0, 1, 1, 0, 0, -127); push(0, 0, z0, 0, 1, 0, 0, -127); push(0, 16, z0, 0, 0, 0, 0, -127);
    const op = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && px[(y * 16 + x) * 4 + 3] > 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!op(x, y)) continue;
      const u0 = (x + 0.25) / 16, u1 = (x + 0.75) / 16, v0 = (y + 0.25) / 16, v1 = (y + 0.75) / 16;
      const X0 = x, X1 = x + 1, Y1 = 16 - y, Y0 = 15 - y;
      if (!op(x - 1, y)) { push(X0, Y1, z0, u0, v0, -127, 0, 0); push(X0, Y0, z0, u0, v1, -127, 0, 0); push(X0, Y0, z1, u1, v1, -127, 0, 0); push(X0, Y1, z1, u1, v0, -127, 0, 0); }
      if (!op(x + 1, y)) { push(X1, Y1, z1, u0, v0, 127, 0, 0); push(X1, Y0, z1, u0, v1, 127, 0, 0); push(X1, Y0, z0, u1, v1, 127, 0, 0); push(X1, Y1, z0, u1, v0, 127, 0, 0); }
      if (!op(x, y - 1)) { push(X0, Y1, z0, u0, v0, 0, 127, 0); push(X0, Y1, z1, u0, v1, 0, 127, 0); push(X1, Y1, z1, u1, v1, 0, 127, 0); push(X1, Y1, z0, u1, v0, 0, 127, 0); }
      if (!op(x, y + 1)) { push(X0, Y0, z1, u0, v0, 0, -127, 0); push(X0, Y0, z0, u0, v1, 0, -127, 0); push(X1, Y0, z0, u1, v1, 0, -127, 0); push(X1, Y0, z1, u1, v0, 0, -127, 0); }
    }
    const buf = new ArrayBuffer(verts.length * 24);
    const s = new Int16Array(buf), us = new Uint16Array(buf), bb = new Int8Array(buf), ub = new Uint8Array(buf);
    verts.forEach((q, i) => {
      s[i * 12] = q[0] * 16; s[i * 12 + 1] = q[1] * 16; s[i * 12 + 2] = q[2] * 16; s[i * 12 + 3] = q[3];
      us[i * 12 + 4] = Math.round(q[4] * 4096); us[i * 12 + 5] = Math.round(q[5] * 4096);
      bb[i * 24 + 12] = q[6]; bb[i * 24 + 13] = q[7]; bb[i * 24 + 14] = q[8]; ub[i * 24 + 15] = MAT.DEFAULT;
      ub[i * 24 + 16] = 255; ub[i * 24 + 17] = 0; ub[i * 24 + 18] = 255; ub[i * 24 + 19] = FLAG_NOAO;
      ub[i * 24 + 20] = r; ub[i * 24 + 21] = g; ub[i * 24 + 22] = b; ub[i * 24 + 23] = 0;
    });
    const { vao } = this.makeVAO(buf);
    m = { vao, quads: verts.length / 4, kind: 'sprite', layers: [0, verts.length, 0] };
    this.cache.set(key, m);
    return m;
  }
  // mesh for an item stack
  forItem(id) {
    const it = ITEMS[id];
    if (!it) return null;
    const ic = it.icon || { type: 'block' };
    if (ic.type === 'block' && it.block !== undefined) return this.block(it.block);
    if (ic.type === 'item') return this.sprite('item/' + ic.tex);
    if (ic.type === 'blocktex') {
      const b = it.block !== undefined ? BLOCKS[it.block] : null;
      const tint = b && b.tint === 'grass' ? 0x91bd59 : b && b.tint === 'foliage' ? 0x48b518 : b && b.tint === 'lily' ? 0x71c35c : 0xffffff;
      return this.sprite(ic.tex, tint);
    }
    return this.sprite('item/' + it.name);
  }
  isFlat(id) { const it = ITEMS[id]; return !it || (it.icon && it.icon.type !== 'block'); }
}
