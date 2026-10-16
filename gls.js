/* gls.js — shares window.gg (see index.html) */
(() => {
'use strict';
const { THREE, JSZip } = gg;
const { AIR, Atlas, B, BIOMES, BIO_DESERT, BIO_MOUNTAINS, BIO_SNOWY, BIO_TAIGA, Blocks, CHUNK_H, DAY_LENGTH, DIRS, Events, FACE_NX, FACE_NY, FACE_NZ, FACE_PX, FACE_PY, FACE_PZ, GrowBuf, HDIRS, TICK_RATE, TINTS, bidx, clamp, floor, hexToRgb, mixColor, rng, smoothstep } = gg;

/* ============================================================================
   8. LIGHTING ENGINE — sky light + block light, BFS propagation
   ----------------------------------------------------------------------------
   Two 4-bit channels per block. Sky light: 15 straight down from the sky, then
   spreads sideways losing 1 per block (more through water/leaves). Block light:
   emitted by torches, lava, glowstone... Removal uses the classic "un-light
   then re-propagate from the frontier" algorithm so updates are incremental.
   ========================================================================== */
const Lighting = {
  QCAP: 1 << 18,
  qx: new Int32Array(1 << 18), qy: new Int32Array(1 << 18), qz: new Int32Array(1 << 18), ql: new Int32Array(1 << 18),
  qh: 0, qt: 0,   // ring buffer head/tail (propagate queue)
  rx: new Int32Array(1 << 16), ry: new Int32Array(1 << 16), rz: new Int32Array(1 << 16), rl: new Int32Array(1 << 16),
  rh: 0, rt: 0,   // removal queue

  push(x, y, z) { const i = this.qt; this.qx[i] = x; this.qy[i] = y; this.qz[i] = z; this.qt = (i + 1) & (this.QCAP - 1); if (this.qt === this.qh) console.warn('light queue overflow'); },
  pushR(x, y, z, l) { const i = this.rt; this.rx[i] = x; this.ry[i] = y; this.rz[i] = z; this.rl[i] = l; this.rt = (i + 1) & 0xffff; },

  get(c, i, sky) { return sky ? c.sky[i] : c.blk[i]; },
  set(c, i, sky, v, x, y, z) {
    if (sky) c.sky[i] = v; else c.blk[i] = v;
    c.dirty = true;
    // Border light changes affect the neighbour's smooth lighting
    const lx = x & 15, lz = z & 15;
    if (lx === 0 || lx === 15 || lz === 0 || lz === 15) gg.ChunkManager.markDirty(x, y, z);
  },

  // Full initial lighting for a freshly generated chunk (neighbours may be unlit).
  initChunk(c) {
    const bl = c.blocks, sky = c.sky, blk = c.blk, ox = c.cx * 16, oz = c.cz * 16;
    sky.fill(0); blk.fill(0);
    // 1. Straight-down sky light per column
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const base = (x << 11) | (z << 7);
      let l = 15;
      for (let y = CHUNK_H - 1; y >= 0; y--) {
        const def = Blocks.byId[bl[base | y]];
        if (def.opaque) l = 0; else if (def.opacity && l > 0) l = Math.max(0, l - def.opacity);
        sky[base | y] = l;
        if (l === 0) { for (let yy = y - 1; yy >= 0; yy--) sky[base | yy] = 0; break; }
      }
    }
    // 2. Seed sky BFS from lit blocks that border a darker non-opaque block (inside chunk) + all border columns
    this.qh = this.qt = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const base = (x << 11) | (z << 7), border = x === 0 || x === 15 || z === 0 || z === 15;
      for (let y = 0; y < CHUNK_H; y++) {
        const l = sky[base | y];
        if (l === 0) continue;
        if (border) { this.push(ox + x, y, oz + z); continue; }
        if ((x > 0 && sky[base - 2048 + y] < l - 1) || (x < 15 && sky[base + 2048 + y] < l - 1) || (z > 0 && sky[base - 128 + y] < l - 1) || (z < 15 && sky[base + 128 + y] < l - 1)) this.push(ox + x, y, oz + z);
      }
    }
    this.seedFromNeighbors(c, true);
    this.propagate(true);
    // 3. Block light from emitters
    this.qh = this.qt = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const base = (x << 11) | (z << 7);
      for (let y = 0; y < CHUNK_H; y++) { const e = Blocks.byId[bl[base | y]].light; if (e) { blk[base | y] = e; this.push(ox + x, y, oz + z); } }
    }
    this.seedFromNeighbors(c, false);
    this.propagate(false);
    c.state = gg.CH_LIT;
    c.dirty = true;
  },
  // Enqueue lit blocks of neighbouring chunks that touch this chunk's border.
  seedFromNeighbors(c, sky) {
    const ox = c.cx * 16, oz = c.cz * 16;
    const sides = [[c.cx - 1, c.cz, 15, -1], [c.cx + 1, c.cz, 0, -1], [c.cx, c.cz - 1, -1, 15], [c.cx, c.cz + 1, -1, 0]];
    for (const [ncx, ncz, fx, fz] of sides) {
      const n = gg.world.getChunk(ncx, ncz);
      if (!n || n.state < gg.CH_LIT) continue;
      const arr = sky ? n.sky : n.blk;
      for (let t = 0; t < 16; t++) {
        const lx = fx >= 0 ? fx : t, lz = fz >= 0 ? fz : t, base = (lx << 11) | (lz << 7);
        for (let y = 0; y < CHUNK_H; y++) if (arr[base | y] > 1) this.push(ncx * 16 + lx, y, ncz * 16 + lz);
      }
    }
  },

  // BFS flood: spread light from every queued block to its neighbours.
  propagate(sky) {
    while (this.qh !== this.qt) {
      const i = this.qh; this.qh = (i + 1) & (this.QCAP - 1);
      const x = this.qx[i], y = this.qy[i], z = this.qz[i];
      const c = gg.world.chunkAt(x, z); if (!c || c.state < gg.CH_GENERATED) continue;
      const l = this.get(c, bidx(x & 15, y, z & 15), sky);
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CHUNK_H) continue;
        const nc = (nx >> 4) === c.cx && (nz >> 4) === c.cz ? c : gg.world.chunkAt(nx, nz);
        if (!nc || nc.state < gg.CH_GENERATED) continue;
        const ni = bidx(nx & 15, ny, nz & 15);
        const def = Blocks.byId[nc.blocks[ni]];
        if (def.opaque) continue;
        const nl = (sky && d === FACE_NY && l === 15) ? 15 - def.opacity : l - Math.max(1, def.opacity);
        if (nl <= 0) continue;
        if (this.get(nc, ni, sky) >= nl) continue;
        this.set(nc, ni, sky, nl, nx, ny, nz);
        this.push(nx, ny, nz);
      }
    }
  },
  // Removal flood: clear light that depended on removed light, collecting re-propagation seeds.
  unpropagate(sky) {
    while (this.rh !== this.rt) {
      const i = this.rh; this.rh = (i + 1) & 0xffff;
      const x = this.rx[i], y = this.ry[i], z = this.rz[i], ol = this.rl[i];
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CHUNK_H) continue;
        const nc = gg.world.chunkAt(nx, nz);
        if (!nc || nc.state < gg.CH_GENERATED) continue;
        const ni = bidx(nx & 15, ny, nz & 15);
        const nl = this.get(nc, ni, sky);
        if (nl === 0) continue;
        if (nl < ol || (sky && d === FACE_NY && ol === 15 && nl === 15)) { this.set(nc, ni, sky, 0, nx, ny, nz); this.pushR(nx, ny, nz, nl); }
        else this.push(nx, ny, nz);
      }
    }
  },

  // Incremental update after a single block changes at (x,y,z).
  onBlockChanged(x, y, z, oldId, newId) {
    const c = gg.world.chunkAt(x, z); if (!c || c.state < gg.CH_LIT) return;
    const i = bidx(x & 15, y, z & 15);
    const newDef = Blocks.byId[newId];
    for (const sky of [true, false]) {
      this.qh = this.qt = 0; this.rh = this.rt = 0;
      const old = this.get(c, i, sky);
      if (old > 0) { this.set(c, i, sky, 0, x, y, z); this.pushR(x, y, z, old); this.unpropagate(sky); }
      if (!sky && newDef.light > 0) { this.set(c, i, false, newDef.light, x, y, z); this.push(x, y, z); }
      if (!newDef.opaque) for (let d = 0; d < 6; d++) this.push(x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
      this.propagate(sky);
    }
  }
};
/* ============================================================================
   9. MESHING — custom shader, greedy meshing, block models
   ----------------------------------------------------------------------------
   Vertex layout: position(3) uv(2, tile units - repeats via fract) tile(1)
   light(2: sky, block — already multiplied by ambient occlusion) tint(3).
   Full cubes go through the greedy mesher (per-face culling, merged quads
   only when texture, tint and all 4 vertex lights match). Everything else
   (plants, torches, liquids, doors...) is emitted per block by a model
   function. Opaque + alpha-tested faces share one mesh; water is a second,
   blended mesh.
   ========================================================================== */
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
const AO_CURVE = [0.45, 0.65, 0.85, 1.0];
const WHITE_RGB = [1, 1, 1];
const BIRCH_RGB = hexToRgb(TINTS.birch), SPRUCE_RGB = hexToRgb(TINTS.spruce);
const PX = 18, PY = CHUNK_H + 2, PZ = 18;
const pidx = (x, y, z) => ((x + 1) * PY + (y + 1)) * PZ + (z + 1);
const OPEN_SIDE = [2, 3, 1, 0]; // door: which side the slab swings to when opened

const CHUNK_VERT = `
attribute float tile; attribute vec2 light; attribute vec3 tint;
varying vec2 vUv; varying float vTile; varying vec2 vLight; varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vTile = tile; vLight = light; vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CHUNK_FRAG = `
uniform sampler2D uAtlas; uniform float uTiles; uniform float uSkyBright; uniform float uAlphaTest; uniform vec3 uNightTint;
varying vec2 vUv; varying float vTile; varying vec2 vLight; varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  float t = floor(vTile + 0.5);
  vec2 tp = vec2(mod(t, uTiles), floor(t / uTiles));
  vec2 f = clamp(fract(vUv), 0.002, 0.998);
  vec4 tex = texture2D(uAtlas, (tp + f) / uTiles);
  if (tex.a < uAlphaTest) discard;
  float sky = vLight.x * uSkyBright;
  float l = max(sky, vLight.y);
  float br = 0.035 + 0.965 * (l * l * 0.55 + l * 0.45);
  vec3 col = tex.rgb * vTint * br;
  col = mix(col, col * uNightTint, (1.0 - uSkyBright) * (1.0 - smoothstep(sky, sky + 0.05, vLight.y)));
  gl_FragColor = vec4(col, tex.a);
  #include <fog_fragment>
}`;

// Collision/render boxes for non-cube blocks, in block units (0..1). null = full cube, [] = none.
function blockBoxes(def, meta) {
  switch (def.model) {
    case 'cube': return null;
    case 'box': case 'layer': { const b = def.box; return [[b[0] / 16, b[1] / 16, b[2] / 16, b[3] / 16, b[4] / 16, b[5] / 16]]; }
    case 'door': {
      const side = (meta & 2) ? OPEN_SIDE[(meta >> 2) & 3] : ((meta >> 2) & 3);
      return [[[13 / 16, 0, 0, 1, 1, 1], [0, 0, 0, 3 / 16, 1, 1], [0, 0, 13 / 16, 1, 1, 1], [0, 0, 0, 1, 1, 3 / 16]][side]];
    }
    default: return [];
  }
}

class MeshBuilder {
  constructor() { this.pos = new GrowBuf(1 << 15); this.uv = new GrowBuf(1 << 14); this.tile = new GrowBuf(1 << 13); this.light = new GrowBuf(1 << 14); this.tint = new GrowBuf(1 << 15); this.index = new GrowBuf(1 << 14, Uint32Array); this.vcount = 0; }
  reset() { this.pos.reset(); this.uv.reset(); this.tile.reset(); this.light.reset(); this.tint.reset(); this.index.reset(); this.vcount = 0; }
  vertex(x, y, z, u, v, tile, ls, lb, r, g, b) {
    this.pos.push(x); this.pos.push(y); this.pos.push(z); this.uv.push(u); this.uv.push(v); this.tile.push(tile);
    this.light.push(ls); this.light.push(lb); this.tint.push(r); this.tint.push(g); this.tint.push(b);
    return this.vcount++;
  }
  quad(a, b, c, d, flip) {
    const ix = this.index;
    if (flip) { ix.push(b); ix.push(c); ix.push(d); ix.push(b); ix.push(d); ix.push(a); }
    else { ix.push(a); ix.push(b); ix.push(c); ix.push(a); ix.push(c); ix.push(d); }
  }
  toGeometry() {
    if (this.vcount === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(), 2));
    g.setAttribute('tile', new THREE.BufferAttribute(this.tile.slice(), 1));
    g.setAttribute('light', new THREE.BufferAttribute(this.light.slice(), 2));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint.slice(), 3));
    g.setIndex(new THREE.BufferAttribute(this.index.slice(), 1));
    g.computeBoundingSphere();
    return g;
  }
}

const Mesher = {
  pb: new Uint8Array(PX * PY * PZ), pm: new Uint8Array(PX * PY * PZ), ps: new Uint8Array(PX * PY * PZ), pl: new Uint8Array(PX * PY * PZ),
  opaqueById: null,
  mT: new Int32Array(16 * CHUNK_H), mK1: new Int32Array(16 * CHUNK_H), mK2: new Int32Array(16 * CHUNK_H), mK3: new Int32Array(16 * CHUNK_H),
  ob: new MeshBuilder(), wb: new MeshBuilder(),
  material: null, waterMaterial: null,
  cl: [[0, 0, 3], [0, 0, 3], [0, 0, 3], [0, 0, 3]],

  init() {
    this.opaqueById = new Uint8Array(256);
    for (const b of Blocks.byId) this.opaqueById[b.id] = b.opaque ? 1 : 0;
    const mk = (transparent, alphaTest) => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uAtlas: { value: null }, uTiles: { value: 1 }, uSkyBright: { value: 1 }, uAlphaTest: { value: alphaTest }, uNightTint: { value: new THREE.Vector3(0.62, 0.7, 1.0) }
      }]),
      vertexShader: CHUNK_VERT, fragmentShader: CHUNK_FRAG, fog: true, transparent, depthWrite: true, side: THREE.FrontSide
    });
    this.material = mk(false, 0.5);
    this.waterMaterial = mk(true, 0.05);
    this.updateAtlas();
    Events.on('atlasRebuilt', () => this.updateAtlas());
  },
  updateAtlas() {
    for (const m of [this.material, this.waterMaterial]) { m.uniforms.uAtlas.value = Atlas.texture; m.uniforms.uTiles.value = Atlas.tilesPerRow; }
  },
  setSkyBrightness(v) { this.material.uniforms.uSkyBright.value = v; this.waterMaterial.uniforms.uSkyBright.value = v; },

  // Copy the chunk plus a 1-block border of its neighbours into padded arrays.
  fillPadded(c) {
    const pb = this.pb, pm = this.pm, ps = this.ps, pl = this.pl, ox = c.cx * 16, oz = c.cz * 16;
    for (let dx = -1; dx <= 16; dx++) for (let dz = -1; dz <= 16; dz++) {
      const wx = ox + dx, wz = oz + dz;
      const ch = (dx >= 0 && dx < 16 && dz >= 0 && dz < 16) ? c : gg.world.chunkAt(wx, wz);
      const p0 = pidx(dx, -1, dz);
      pb[p0] = B.bedrock; pm[p0] = 0; ps[p0] = 0; pl[p0] = 0;
      const top = pidx(dx, CHUNK_H, dz); pb[top] = 0; pm[top] = 0; ps[top] = 15; pl[top] = 0;
      if (!ch || ch.state < gg.CH_GENERATED) {
        for (let y = 0; y < CHUNK_H; y++) { const p = p0 + (y + 1) * PZ; pb[p] = 0; pm[p] = 0; ps[p] = 15; pl[p] = 0; }
        continue;
      }
      const lx = wx & 15, lz = wz & 15, base = (lx << 11) | (lz << 7);
      const bl = ch.blocks, me = ch.meta, sk = ch.sky, bk = ch.blk;
      for (let y = 0; y < CHUNK_H; y++) { const p = p0 + (y + 1) * PZ, i = base | y; pb[p] = bl[i]; pm[p] = me[i]; ps[p] = sk[i]; pl[p] = bk[i]; }
    }
  },

  faceVisible(def, ndef) {
    if (ndef.id === AIR) return true;
    if (ndef.opaque) return false;
    if (ndef.transparent && ndef.cullSame && ndef.id === def.id) return false;
    return true;
  },
  tintFor(def, face, biome) {
    const t = def.tint; if (!t) return WHITE_RGB;
    const key = typeof t === 'string' ? t : (face === FACE_PY ? t.top : face === FACE_NY ? t.bottom : t.side);
    switch (key) {
      case 'grass': return biome.grassRGB; case 'foliage': return biome.foliageRGB; case 'water': return biome.waterRGB;
      case 'birch': return BIRCH_RGB; case 'spruce': return SPRUCE_RGB; default: return WHITE_RGB;
    }
  },

  // Emit one axis-aligned face of the box [x0..x1]x[y0..y1]x[z0..z1] (local chunk coords).
  // cl: 4 corner lights [sky, blk, ao] indexed (isMaxI?1:0)+(isMaxJ?2:0) on the face's (i,j) axes.
  emitFace(b, face, x0, y0, z0, x1, y1, z1, tile, cl, tint, shade, uvo, bothSides) {
    let V;
    switch (face) {
      case FACE_PX: V = [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1]; break;
      case FACE_NX: V = [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0]; break;
      case FACE_PY: V = [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0]; break;
      case FACE_NY: V = [x1, y0, z1, x0, y0, z1, x0, y0, z0, x1, y0, z0]; break;
      case FACE_PZ: V = [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]; break;
      default:      V = [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0];
    }
    const bx = floor(x0 + 1e-4), by = floor(y0 + 1e-4), bz = floor(z0 + 1e-4);
    const axis = face >> 1;
    const r = tint[0] * shade, g = tint[1] * shade, bb = tint[2] * shade;
    const ids = [0, 0, 0, 0];
    let sumA = 0, sumB = 0;
    for (let k = 0; k < 4; k++) {
      const vx = V[k * 3], vy = V[k * 3 + 1], vz = V[k * 3 + 2];
      let u, v;
      switch (face) {
        case FACE_PX: u = (bz + 1) - vz; v = (by + 1) - vy; break;
        case FACE_NX: u = vz - bz; v = (by + 1) - vy; break;
        case FACE_PY: u = vx - bx; v = vz - bz; break;
        case FACE_NY: u = (bx + 1) - vx; v = vz - bz; break;
        case FACE_PZ: u = vx - bx; v = (by + 1) - vy; break;
        default: u = (bx + 1) - vx; v = (by + 1) - vy;
      }
      if (uvo) { u = uvo[0] + (u - floor(u + 1e-4)) * (uvo[2] - uvo[0]); v = uvo[1] + (v - floor(v + 1e-4)) * (uvo[3] - uvo[1]); }
      const iCoord = axis === 0 ? vz : vx, jCoord = axis === 1 ? vz : vy;
      const ci = (iCoord > (axis === 0 ? z0 : x0) + 1e-4 ? 1 : 0) + (jCoord > (axis === 1 ? z0 : y0) + 1e-4 ? 2 : 0);
      const L = cl[ci], ao = AO_CURVE[L[2]];
      const tot = (L[0] + L[1]) * ao;
      if (k === 0 || k === 2) sumA += tot; else sumB += tot;
      ids[k] = b.vertex(vx, vy, vz, u, v, tile, L[0] / 15 * ao, L[1] / 15 * ao, r, g, bb);
    }
    b.quad(ids[0], ids[1], ids[2], ids[3], sumA < sumB);
    if (bothSides) b.quad(ids[3], ids[2], ids[1], ids[0], sumA < sumB);
  },

  // Greedy meshing of all full-cube blocks in the chunk
  greedy(c) {
    const pb = this.pb, pm = this.pm, ps = this.ps, pl = this.pl, op = this.opaqueById, byId = Blocks.byId;
    const mT = this.mT, mK1 = this.mK1, mK2 = this.mK2, mK3 = this.mK3, cl = this.cl, ob = this.ob;
    const DIMS = [16, CHUNK_H, 16];
    const p = [0, 0, 0], q = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      const iAxis = axis === 0 ? 2 : 0, jAxis = axis === 1 ? 2 : 1;
      const ni = DIMS[iAxis], nj = DIMS[jAxis], n = DIMS[axis];
      const iu = [0, 0, 0], ju = [0, 0, 0]; iu[iAxis] = 1; ju[jAxis] = 1;
      for (let side = 0; side < 2; side++) {
        const face = axis * 2 + side, dn = side === 0 ? 1 : -1, shade = FACE_SHADE[face];
        for (let s = 0; s < n; s++) {
          let any = false;
          for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
            const m = j * ni + i;
            p[axis] = s; p[iAxis] = i; p[jAxis] = j;
            const pi = pidx(p[0], p[1], p[2]);
            const id = pb[pi];
            if (id === AIR) { mT[m] = 0; continue; }
            const def = byId[id];
            if (def.model !== 'cube') { mT[m] = 0; continue; }
            q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[axis] += dn;
            const qi = pidx(q[0], q[1], q[2]);
            if (!this.faceVisible(def, byId[pb[qi]])) { mT[m] = 0; continue; }
            const tiles = Blocks.tilesFor(def, pm[pi]);
            const bio = BIOMES[c.biomes[((p[0]) << 4) | p[2]] || 0];
            const tint = this.tintFor(def, face, bio);
            let k1 = 0, k2 = 0;
            for (let cidx = 0; cidx < 4; cidx++) {
              const si = (cidx & 1) ? 1 : -1, sj = (cidx & 2) ? 1 : -1;
              const s1 = pidx(q[0] + si * iu[0], q[1] + si * iu[1], q[2] + si * iu[2]);
              const s2 = pidx(q[0] + sj * ju[0], q[1] + sj * ju[1], q[2] + sj * ju[2]);
              const cc = pidx(q[0] + si * iu[0] + sj * ju[0], q[1] + si * iu[1] + sj * ju[1], q[2] + si * iu[2] + sj * ju[2]);
              const o1 = op[pb[s1]], o2 = op[pb[s2]], oc = op[pb[cc]];
              const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
              let ssum = ps[qi], bsum = pl[qi], cnt = 1;
              if (!o1) { ssum += ps[s1]; bsum += pl[s1]; cnt++; }
              if (!o2) { ssum += ps[s2]; bsum += pl[s2]; cnt++; }
              if (!oc && !(o1 && o2)) { ssum += ps[cc]; bsum += pl[cc]; cnt++; }
              const sa = Math.round(ssum / cnt), ba = Math.round(bsum / cnt);
              k1 |= (sa << (cidx * 4)) | (ao << (16 + cidx * 2));
              k2 |= ba << (cidx * 4);
            }
            mT[m] = tiles[face] + 1; mK1[m] = k1; mK2[m] = k2 | (tint === WHITE_RGB ? 0 : 1 << 16);
            mK3[m] = (Math.round(tint[0] * 255) << 16) | (Math.round(tint[1] * 255) << 8) | Math.round(tint[2] * 255);
            any = true;
          }
          if (!any) continue;
          for (let j = 0; j < nj; j++) for (let i = 0; i < ni;) {
            const m = j * ni + i;
            if (!mT[m]) { i++; continue; }
            const t = mT[m], k1 = mK1[m], k2 = mK2[m], k3 = mK3[m];
            let w = 1; while (i + w < ni && mT[m + w] === t && mK1[m + w] === k1 && mK2[m + w] === k2 && mK3[m + w] === k3) w++;
            let h = 1;
            outer: while (j + h < nj) {
              for (let k = 0; k < w; k++) { const mm = (j + h) * ni + i + k; if (mT[mm] !== t || mK1[mm] !== k1 || mK2[mm] !== k2 || mK3[mm] !== k3) break outer; }
              h++;
            }
            for (let cidx = 0; cidx < 4; cidx++) { cl[cidx][0] = (k1 >> (cidx * 4)) & 15; cl[cidx][1] = (k2 >> (cidx * 4)) & 15; cl[cidx][2] = (k1 >> (16 + cidx * 2)) & 3; }
            const tint = [((k3 >> 16) & 255) / 255, ((k3 >> 8) & 255) / 255, (k3 & 255) / 255];
            const lo = [0, 0, 0], hi = [0, 0, 0];
            lo[axis] = hi[axis] = s + (side === 0 ? 1 : 0);
            lo[iAxis] = i; hi[iAxis] = i + w; lo[jAxis] = j; hi[jAxis] = j + h;
            this.emitFace(ob, face, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], t - 1, cl, tint, shade, null, false);
            for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mT[(j + hh) * ni + i + k] = 0;
            i += w;
          }
        }
      }
    }
  },

  // ---- Non-cube models ----
  lightAt(x, y, z) { const i = pidx(x, y, z); const c = this.cl; for (let k = 0; k < 4; k++) { c[k][0] = this.ps[i]; c[k][1] = this.pl[i]; c[k][2] = 3; } return c; },
  emitBox(b, x, y, z, box, tiles, cl, tint, cullFlush, uvTop) {
    const x0 = x + box[0] / 16, y0 = y + box[1] / 16, z0 = z + box[2] / 16, x1 = x + box[3] / 16, y1 = y + box[4] / 16, z1 = z + box[5] / 16;
    for (let f = 0; f < 6; f++) {
      if (cullFlush) {
        const flush = (f === 0 && box[3] === 16) || (f === 1 && box[0] === 0) || (f === 2 && box[4] === 16) || (f === 3 && box[1] === 0) || (f === 4 && box[5] === 16) || (f === 5 && box[2] === 0);
        if (flush && this.opaqueById[this.pb[pidx(x + DIRS[f][0], y + DIRS[f][1], z + DIRS[f][2])]]) continue;
      }
      this.emitFace(b, f, x0, y0, z0, x1, y1, z1, tiles[f], cl, tint, FACE_SHADE[f], f === FACE_PY ? uvTop : null, false);
    }
  },
  emitCross(b, x, y, z, tile, cl, tint) {
    const a = 0.06, c = 0.94;
    // two diagonal quads, both windings so they are visible from all sides
    const q = (ax, az, bx, bz) => {
      const v0 = b.vertex(x + ax, y, z + az, 0, 1, tile, cl[0][0] / 15, cl[0][1] / 15, tint[0], tint[1], tint[2]);
      const v1 = b.vertex(x + bx, y, z + bz, 1, 1, tile, cl[0][0] / 15, cl[0][1] / 15, tint[0], tint[1], tint[2]);
      const v2 = b.vertex(x + bx, y + 1, z + bz, 1, 0, tile, cl[0][0] / 15, cl[0][1] / 15, tint[0], tint[1], tint[2]);
      const v3 = b.vertex(x + ax, y + 1, z + az, 0, 0, tile, cl[0][0] / 15, cl[0][1] / 15, tint[0], tint[1], tint[2]);
      b.quad(v0, v1, v2, v3, false); b.quad(v3, v2, v1, v0, false);
    };
    q(a, a, c, c); q(a, c, c, a);
  },
  // Liquid surface height of one cell (MC: (8-level)/9, source/falling 8/9, covered = 1)
  liquidH(x, y, z, id) {
    const p = pidx(x, y, z);
    if (this.pb[p] !== id) return -1;
    const m = this.pm[p];
    return m === 0 || m >= 8 ? 8 / 9 : (8 - m) / 9;
  },
  // Corner height shared by the 4 cells around corner (x,z) — every cell computes the same value for a
  // shared corner, so neighbouring surfaces always meet (no seams). MC rules: same liquid above any of
  // the 4 cells -> 1; sources/high cells weigh 10; open non-solid cells pull it to 0; solids are ignored.
  liquidCorner(x, y, z, id) {
    let sum = 0, w = 0;
    for (let k = 0; k < 4; k++) {
      const cx = x - 1 + (k & 1), cz = z - 1 + (k >> 1);
      if (this.pb[pidx(cx, y + 1, cz)] === id) return 1;
      const h = this.liquidH(cx, y, cz, id);
      if (h >= 0) { const wt = h >= 0.8 ? 10 : 1; sum += h * wt; w += wt; }
      else if (!Blocks.byId[this.pb[pidx(cx, y, cz)]].solid) w += 1;
    }
    return w ? sum / w : 8 / 9;
  },
  // Smooth corner light: mean over the non-opaque cells around the corner of max(cell, cell above)
  liquidCornerLight(x, y, z) {
    let s = 0, bl = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      const cx = x - 1 + (k & 1), cz = z - 1 + (k >> 1), p = pidx(cx, y, cz), q = pidx(cx, y + 1, cz);
      if (this.opaqueById[this.pb[p]] && this.opaqueById[this.pb[q]]) continue;
      s += Math.max(this.ps[p], this.ps[q]); bl += Math.max(this.pl[p], this.pl[q]); n++;
    }
    return n ? [s / n, bl / n] : [this.ps[pidx(x, y, z)], this.pl[pidx(x, y, z)]];
  },
  // Quad with per-vertex positions and per-vertex light Ls[k] = [sky, blk]
  liquidQuad(b, P, uv, tile, Ls, tint, shade, both) {
    const r = tint[0] * shade, g = tint[1] * shade, bb = tint[2] * shade;
    const v = [0, 1, 2, 3].map(k => b.vertex(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], uv[k * 2], uv[k * 2 + 1], tile, Ls[k][0] / 15, Ls[k][1] / 15, r, g, bb));
    b.quad(v[0], v[1], v[2], v[3], false);
    if (both) b.quad(v[3], v[2], v[1], v[0], false);
  },
  emitLiquid(b, x, y, z, def, meta, bio) {
    const pb = this.pb, id = def.id, op = this.opaqueById;
    const covered = pb[pidx(x, y + 1, z)] === id;
    const H = (cx, cz) => covered ? 1 : this.liquidCorner(cx, y, cz, id);
    const h00 = H(x, z), h10 = H(x + 1, z), h01 = H(x, z + 1), h11 = H(x + 1, z + 1);
    const p = pidx(x, y, z), L = [this.ps[p], this.pl[p]], L4 = [L, L, L, L], tile = def.tiles[0];
    const tint = def.tint === 'water' ? bio.waterRGB : WHITE_RGB;
    const X0 = x, X1 = x + 1, Z0 = z, Z1 = z + 1, Y = y;
    if (!covered) {
      const CL = (cx, cz) => this.liquidCornerLight(cx, y, cz);
      this.liquidQuad(b, [X0, Y + h01, Z1, X1, Y + h11, Z1, X1, Y + h10, Z0, X0, Y + h00, Z0], [0, 1, 1, 1, 1, 0, 0, 0], tile,
        [CL(X0, Z1), CL(X1, Z1), CL(X1, Z0), CL(X0, Z0)], tint, 1.0, true);
    }
    if (pb[pidx(x, y - 1, z)] !== id && !op[pb[pidx(x, y - 1, z)]])
      this.liquidQuad(b, [X1, Y, Z1, X0, Y, Z1, X0, Y, Z0, X1, Y, Z0], [0, 1, 1, 1, 1, 0, 0, 0], tile, L4, tint, 0.5, false);
    // sides: [face, a(x,z), b(x,z), ha, hb] wound CCW from outside; skip same-liquid and opaque neighbours
    const sides = [
      [FACE_PX, X1, Z1, X1, Z0, h11, h10], [FACE_NX, X0, Z0, X0, Z1, h00, h01],
      [FACE_PZ, X0, Z1, X1, Z1, h01, h11], [FACE_NZ, X1, Z0, X0, Z0, h10, h00]];
    for (const [f, ax, az, bx, bz, ha, hb] of sides) {
      const d = DIRS[f], q = pidx(x + d[0], y, z + d[2]), nid = pb[q];
      if (nid === id || op[nid]) continue;
      const Ln = [Math.max(L[0], this.ps[q]), Math.max(L[1], this.pl[q])], L4n = [Ln, Ln, Ln, Ln];
      this.liquidQuad(b, [ax, Y, az, bx, Y, bz, bx, Y + hb, bz, ax, Y + ha, az], [0, 1, 1, 1, 1, 1 - hb, 0, 1 - ha], tile, L4n, tint, FACE_SHADE[f], false);
    }
  },
  emitModel(b, x, y, z, def, meta, bio) {
    const cl = this.lightAt(x, y, z);
    switch (def.model) {
      case 'cross': this.emitCross(b, x, y, z, def.tiles[0], cl, this.tintFor(def, FACE_PZ, bio)); break;
      case 'fire': this.emitCross(b, x, y, z, def.tiles[0], cl, WHITE_RGB); break;
      case 'crop': {
        const tile = Atlas.index('wheat_stage' + Math.min(7, meta));
        const tnt = WHITE_RGB, L = cl[0];
        const quad = (x0, z0, x1, z1) => {
          const v0 = b.vertex(x + x0, y, z + z0, 0, 1, tile, L[0] / 15, L[1] / 15, 1, 1, 1), v1 = b.vertex(x + x1, y, z + z1, 1, 1, tile, L[0] / 15, L[1] / 15, 1, 1, 1);
          const v2 = b.vertex(x + x1, y + 1, z + z1, 1, 0, tile, L[0] / 15, L[1] / 15, 1, 1, 1), v3 = b.vertex(x + x0, y + 1, z + z0, 0, 0, tile, L[0] / 15, L[1] / 15, 1, 1, 1);
          b.quad(v0, v1, v2, v3, false); b.quad(v3, v2, v1, v0, false);
        };
        quad(0, 0.25, 1, 0.25); quad(0, 0.75, 1, 0.75); quad(0.25, 0, 0.25, 1); quad(0.75, 0, 0.75, 1); void tnt;
        break;
      }
      case 'box': case 'layer': this.emitBox(b, x, y, z, def.box, Blocks.tilesFor(def, meta), cl, WHITE_RGB, true, null); break;
      case 'torch': {
        let box = [7, 0, 7, 9, 10, 9];
        if (meta >= 1 && meta <= 4) { const d = HDIRS[meta - 1]; box = [7 + d[0] * 6, 3, 7 + d[2] * 6, 9 + d[0] * 6, 13, 9 + d[2] * 6]; }
        const t = def.tiles[0];
        this.emitBox(b, x, y, z, box, [t, t, t, t, t, t], cl, WHITE_RGB, false, [7 / 16, 6 / 16, 9 / 16, 8 / 16]);
        break;
      }
      case 'ladder': {
        const d = meta & 3, t = def.tiles[0];
        const box = [[15, 0, 0, 16, 16, 16], [0, 0, 0, 1, 16, 16], [0, 0, 15, 16, 16, 16], [0, 0, 0, 16, 16, 1]][d];
        const face = [FACE_NX, FACE_PX, FACE_NZ, FACE_PZ][d];
        this.emitFace(b, face, x + box[0] / 16, y, z + box[2] / 16, x + box[3] / 16, y + 1, z + box[5] / 16, t, cl, WHITE_RGB, 0.8, null, false);
        break;
      }
      case 'door': {
        const boxes = blockBoxes(def, meta)[0];
        const t = Atlas.index((meta & 1) ? 'oak_door_top' : 'oak_door_bottom');
        this.emitBox(b, x, y, z, boxes.map(v => v * 16), [t, t, t, t, t, t], cl, WHITE_RGB, false, null);
        break;
      }
    }
  },

  // Build (or rebuild) the meshes of a chunk. Returns true if anything was built.
  buildChunk(c) {
    this.fillPadded(c);
    this.ob.reset(); this.wb.reset();
    this.greedy(c);
    const pb = this.pb, pm = this.pm, byId = Blocks.byId;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const bio = BIOMES[c.biomes[(x << 4) | z] || 0];
      const top = c.height[x * 16 + z];
      for (let y = 0; y < top; y++) {
        const id = pb[pidx(x, y, z)];
        if (id === AIR) continue;
        const def = byId[id];
        if (def.model === 'cube' || def.model === 'none') continue;
        if (def.model === 'liquid') this.emitLiquid(id === B.water ? this.wb : this.ob, x, y, z, def, pm[pidx(x, y, z)], bio);
        else this.emitModel(this.ob, x, y, z, def, pm[pidx(x, y, z)], bio);
      }
    }
    gg.ChunkManager.disposeMesh(c);
    const g = this.ob.toGeometry(), wg = this.wb.toGeometry();
    if (g) { c.mesh = new THREE.Mesh(g, this.material); c.mesh.position.set(c.cx * 16, 0, c.cz * 16); c.mesh.matrixAutoUpdate = false; c.mesh.updateMatrix(); gg.ChunkManager.scene.add(c.mesh); }
    if (wg) { c.waterMesh = new THREE.Mesh(wg, this.waterMaterial); c.waterMesh.position.set(c.cx * 16, 0, c.cz * 16); c.waterMesh.matrixAutoUpdate = false; c.waterMesh.updateMatrix(); c.waterMesh.renderOrder = 1; gg.ChunkManager.scene.add(c.waterMesh); }
    c.meshed = true; c.dirty = false;
    return true;
  }
};

/* ============================================================================
   17. SKY, DAY/NIGHT CYCLE, WEATHER
   ----------------------------------------------------------------------------
   A gradient dome follows the camera; sun and moon orbit on a pivot; stars
   fade in at night. Sky brightness drives the chunk shader's sky-light term.
   ========================================================================== */
const Sky = {
  time: 1000, dayFactor: 1, skyBright: 1, group: null, dome: null, pivot: null, stars: null, day: 0,
  colors: { dayTop: hexToRgb('#78a7ff'), dayHor: hexToRgb('#c4dcff'), nightTop: hexToRgb('#02040c'), nightHor: hexToRgb('#0a1030'), sunset: hexToRgb('#ff8c3a') },
  fogColor: new THREE.Color(),
  init(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    const mat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } }, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = normalize(vP).y; float t = smoothstep(-0.05, 0.45, h); gl_FragColor = vec4(mix(hor, top, t), 1.0); }'
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), mat); this.dome.renderOrder = -10; this.dome.frustumCulled = false; this.group.add(this.dome);
    this.pivot = new THREE.Group(); this.group.add(this.pivot);
    const disc = (color, size, y) => { const cv = document.createElement('canvas'); cv.width = cv.height = 8; const ctx = cv.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 8); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(1, 1, 3, 3); const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, depthTest: true, transparent: true, fog: false })); m.position.y = y; m.rotation.x = y > 0 ? Math.PI / 2 : -Math.PI / 2; m.renderOrder = -9; m.frustumCulled = false; this.pivot.add(m); return m; };
    this.sun = disc('#ffe8a0', 22, 120); this.moon = disc('#d8dce8', 16, -120);
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = rng.next() * Math.PI * 2, ph = Math.acos(rng.next() * 2 - 1), r = 140; pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.cos(ph); pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: true, fog: false }));
    this.stars.renderOrder = -9; this.stars.frustumCulled = false; this.pivot.add(this.stars);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 0.95 * Math.PI));
    const dl = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI); dl.position.set(0.4, 1, 0.6); scene.add(dl);
    scene.fog = new THREE.Fog(0x000000, 10, 100);
  },
  update(dt, camera, scene) {
    if (gg.Game.running && !gg.Game.paused) this.time += dt * TICK_RATE;
    if (this.time >= DAY_LENGTH) { this.time -= DAY_LENGTH; this.day++; }
    const t01 = this.time / DAY_LENGTH;
    const theta = t01 * Math.PI * 2 - Math.PI / 2; // 0 at noon
    const alt = Math.cos(theta);
    this.dayFactor = smoothstep(-0.12, 0.25, alt);
    const rain = Weather.amount;
    this.skyBright = Math.min(1, ((gg.sim?.ambient ?? 0.609) * 0.33 + 0.8 * this.dayFactor) * (1 - 0.35 * rain - 0.25 * Weather.storm) + Weather.flash); // sim.ambient·0.33 = moonlight floor (default 0.2)
    // Colours
    const c = this.colors, sunset = Math.max(0, 1 - Math.abs(alt) / 0.22) * 0.85;
    let top = mixColor(c.nightTop, c.dayTop, this.dayFactor), hor = mixColor(c.nightHor, c.dayHor, this.dayFactor);
    hor = mixColor(hor, c.sunset, sunset);
    if (rain) { top = mixColor(top, [0.35, 0.38, 0.45], rain * 0.8); hor = mixColor(hor, [0.5, 0.52, 0.58], rain * 0.8); }
    this.dome.material.uniforms.top.value.setRGB(top[0], top[1], top[2]);
    this.dome.material.uniforms.hor.value.setRGB(hor[0], hor[1], hor[2]);
    this.pivot.rotation.z = theta;
    this.stars.material.opacity = (1 - this.dayFactor) * (1 - rain);
    this.sun.material.opacity = 1 - rain * 0.8; this.sun.material.transparent = true;
    this.group.position.copy(camera.position);
    // Fog: distance based, short and blue underwater
    const far = gg.ChunkManager.renderDistance * 16;
    if (gg.player.headInWater) { this.fogColor.setRGB(0.1 * this.skyBright + 0.02, 0.25 * this.skyBright + 0.03, 0.6 * this.skyBright + 0.05); scene.fog.near = 2; scene.fog.far = 14; }
    else if (gg.world.getBlock(floor(gg.player.x), floor(gg.player.y + gg.player.eyeHeight), floor(gg.player.z)) === B.lava) { this.fogColor.setRGB(0.8, 0.3, 0.05); scene.fog.near = 0.5; scene.fog.far = 3; }
    else { this.fogColor.setRGB(hor[0], hor[1], hor[2]); scene.fog.near = far * clamp(1.13 - (gg.rndr?.fogA1 ?? 0.576), 0, 0.95); scene.fog.far = far * 0.98; }
    scene.fog.color.copy(this.fogColor);
    gg.Game.renderer.setClearColor(this.fogColor);
    Mesher.setSkyBrightness(this.skyBright);
  },
  clockString() { const h = floor(((this.time + 6000) % DAY_LENGTH) / 1000), m = floor((((this.time + 6000) % 1000) / 1000) * 60); return `Day ${this.day + 1}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
};

const Weather = {
  raining: false, thunder: false, amount: 0, storm: 0, flash: 0, timer: 6000, points: null, pos: null, N: 1400, snowMode: false,
  STATES: ['clear', 'rain', 'thunder'],
  // Single-select weather (menu pane): applies instantly, even while paused
  get state() { return this.thunder ? 'thunder' : this.raining ? 'rain' : 'clear'; },
  set state(v) {
    this.raining = v !== 'clear'; this.thunder = v === 'thunder'; this.timer = 4000 + rng.int(8000);
    this.amount = this.raining ? 1 : 0; this.storm = this.thunder ? 1 : 0; this.update(0);
  },
  init(scene) {
    this.pos = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0x9db4ff, size: 0.08, transparent: true, opacity: 0.7, sizeAttenuation: true });
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.rainMat); this.points.visible = false; this.points.frustumCulled = false; scene.add(this.points);
    for (let i = 0; i < this.N; i++) this.reset(i, true);
  },
  reset(i, anywhere) { this.pos[i * 3] = gg.player.x + (rng.next() - 0.5) * 28; this.pos[i * 3 + 1] = gg.player.y + (anywhere ? rng.next() * 20 - 4 : 14 + rng.next() * 6); this.pos[i * 3 + 2] = gg.player.z + (rng.next() - 0.5) * 28; },
  toggle() { this.state = this.STATES[(this.STATES.indexOf(this.state) + 1) % 3]; gg.HUD.message('Weather: ' + this.state); },
  tick() {
    if (--this.timer <= 0) { this.raining = !this.raining; this.thunder = this.raining && rng.chance(0.3); this.timer = this.raining ? 2000 + rng.int(5000) : 8000 + rng.int(16000); }
    if (this.storm > 0.5 && rng.chance(1 / 300)) { this.flash = 0.8; gg.res_vam.a.explode([gg.player.x + rng.range(-60, 60), gg.player.y + 30, gg.player.z + rng.range(-60, 60)]); }
  },
  update(dt) {
    const bio = gg.world.getBiome(floor(gg.player.x), floor(gg.player.z));
    const canRain = bio !== BIO_DESERT;
    const target = this.raining && canRain ? 1 : 0;
    this.amount += (target - this.amount) * Math.min(1, dt * 0.5);
    this.storm += ((this.thunder && canRain ? 1 : 0) - this.storm) * Math.min(1, dt * 0.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.snowMode = bio === BIO_SNOWY || (bio === BIO_MOUNTAINS && gg.player.y > 90) || bio === BIO_TAIGA && gg.player.y > 80;
    this.points.material = this.snowMode ? this.snowMat : this.rainMat;
    this.points.visible = this.amount > 0.05;
    if (!this.points.visible) return;
    const speed = this.snowMode ? 3 : 22, p = this.pos;
    const n = floor(this.N * this.amount);
    for (let i = 0; i < n; i++) {
      p[i * 3 + 1] -= speed * dt * (0.8 + (i % 5) * 0.1);
      if (this.snowMode) p[i * 3] += Math.sin(p[i * 3 + 1] + i) * dt * 0.5;
      const gx = floor(p[i * 3]), gz = floor(p[i * 3 + 2]);
      if (p[i * 3 + 1] < gg.world.getHeight(gx, gz) || p[i * 3 + 1] < gg.player.y - 10 || Math.abs(p[i * 3] - gg.player.x) > 16 || Math.abs(p[i * 3 + 2] - gg.player.z) > 16) {
        if (rng.chance(0.15) && gg.world.getBlock(gx, floor(p[i * 3 + 1]), gz) === B.water) gg.Particles.splash(p[i * 3], p[i * 3 + 1] + 0.9, p[i * 3 + 2], 1);
        this.reset(i, false);
      }
    }
    for (let i = n; i < this.N; i++) p[i * 3 + 1] = -100;
    this.points.geometry.attributes.position.needsUpdate = true;
  }
};
Object.assign(gg, { Lighting, FACE_SHADE, AO_CURVE, WHITE_RGB, BIRCH_RGB, SPRUCE_RGB, PX, PY, PZ, pidx, OPEN_SIDE, CHUNK_VERT, CHUNK_FRAG, blockBoxes, MeshBuilder, Mesher, Sky, Weather });

})();
