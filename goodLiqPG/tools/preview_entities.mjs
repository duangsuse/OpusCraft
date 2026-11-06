// Preview + spec test for src/entity/models.js and src/entity/skins.js.
//   node tools/preview_entities.mjs [modelName|label ...]        (SZ=360 env for bigger cells)
// (a) /tmp/skin_<name>.png  : every texture at 6x (transparent texels shown over a dark checker)
// (b) /tmp/model_<name>.png : orthographic, z-buffered, nearest-neighbour software render of each model at rest
//     pose: 3/4 front (yaw 30, pitch 20), 3/4 front-left, front, right side, back 3/4, top.
//     /tmp/model_all.png     : 3/4 view of every model in one sheet.
// The rasterizer does NOT use boxFaces(): it builds the six faces itself and derives every texel from the
// box-UV convention written out in specUV() below (interpolating the cube-local position per pixel), so it
// doubles as a spec test. checkBoxFaces() then verifies that models.js' boxFaces() agrees with specUV().
import { MODELS, BOAT_TEXTURES, boxFaces, partMatrices } from '../src/entity/models.js';
import { paintEntityTextures } from '../src/entity/skins.js';
import { writePNG, sheet } from './png.mjs';

const textures = paintEntityTextures();

// ---- (a) texture dumps over a checkerboard so holes are visible
function checker(t) {
  const out = new Uint8ClampedArray(t.w * t.h * 4);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = (y * t.w + x) * 4, a = t.data[i + 3] / 255, bg = ((x >> 2) + (y >> 2)) & 1 ? 70 : 50;
    for (let c = 0; c < 3; c++) out[i + c] = t.data[i + c] * a + (c === 2 ? bg + 20 : bg) * (1 - a);
    out[i + 3] = 255;
  }
  return out;
}
for (const [name, t] of Object.entries(textures)) {
  if (!(t.data instanceof Uint8ClampedArray) || t.data.length !== t.w * t.h * 4) throw new Error(`texture ${name}: bad data`);
  writePNG(`/tmp/skin_${name}.png`, t.w, t.h, checker(t), 6);
}

// ---- the box-UV convention, straight from the spec
// Cube extents (inflated) and, for a point p on face `face`, the texel coordinate (u,v) in texture pixels.
function extents(c) {
  const g = c.inflate || 0;
  return { x0: c.from[0] - g, y0: c.from[1] - g, z0: c.from[2] - g, x1: c.from[0] + c.size[0] + g, y1: c.from[1] + c.size[1] + g, z1: c.from[2] + c.size[2] + g };
}
const FACE_DIRS = { top: [0, 1, 0], bottom: [0, -1, 0], right: [-1, 0, 0], front: [0, 0, 1], left: [1, 0, 0], back: [0, 0, -1] };
function specUV(cube, face, p) {
  const [w, h, d] = cube.size, [U, V] = cube.uv, e = extents(cube);
  let [x, y, z] = p;
  if (cube.mirror) { // mirrored box: reflect in X, the -X/+X texture regions swap sides
    x = e.x0 + e.x1 - x;
    if (face === 'right') face = 'left'; else if (face === 'left') face = 'right';
  }
  const fx = (x - e.x0) / (e.x1 - e.x0), fy = (e.y1 - y) / (e.y1 - e.y0), fz = (z - e.z0) / (e.z1 - e.z0); // fz: 0 = back, 1 = front
  switch (face) {
    case 'top': return [U + d + fx * w, V + fz * d];                  // top (+Y): (u+d, v) w x d, back edge at v
    case 'bottom': return [U + d + w + fx * w, V + fz * d];           // bottom (-Y): (u+d+w, v) w x d
    case 'right': return [U + fz * d, V + d + fy * h];                // right (-X): (u, v+d) d x h, back on the left
    case 'front': return [U + d + fx * w, V + d + fy * h];            // front (+Z): (u+d, v+d) w x h, -X on the left
    case 'left': return [U + d + w + (1 - fz) * d, V + d + fy * h];   // left (+X): (u+d+w, v+d) d x h, front on the left
    case 'back': return [U + 2 * d + w + (1 - fx) * w, V + d + fy * h]; // back (-Z): (u+2d+w, v+d) w x h, +X on the left
  }
  throw new Error('bad face ' + face);
}
// Texel rectangle of a face (for clamping exact-edge samples).
function specRect(cube, face) {
  const [w, h, d] = cube.size, [U, V] = cube.uv;
  if (cube.mirror) face = face === 'right' ? 'left' : face === 'left' ? 'right' : face;
  return {
    top: [U + d, V, U + d + w, V + d], bottom: [U + d + w, V, U + d + 2 * w, V + d], right: [U, V + d, U + d, V + d + h],
    front: [U + d, V + d, U + d + w, V + d + h], left: [U + d + w, V + d, U + 2 * d + w, V + d + h], back: [U + 2 * d + w, V + d, U + 2 * d + 2 * w, V + d + h],
  }[face];
}
// The 4 corners of each face of the box (any winding; the UV comes from specUV, not from corner order).
function faceCorners(cube, face) {
  const e = extents(cube), X = [e.x0, e.x1], Y = [e.y0, e.y1], Z = [e.z0, e.z1];
  const n = FACE_DIRS[face], ax = n[0] ? 0 : n[1] ? 1 : 2, side = n[ax] > 0 ? 1 : 0;
  const pts = [];
  for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const idx = [0, 0, 0], others = [0, 1, 2].filter(i => i !== ax);
    idx[ax] = side; idx[others[0]] = a; idx[others[1]] = b;
    pts.push([X[idx[0]], Y[idx[1]], Z[idx[2]]]);
  }
  return pts;
}

// boxFaces() (exported for the real renderer) must agree with the spec.
function checkBoxFaces() {
  let n = 0;
  for (const [mname, model] of Object.entries(MODELS)) for (const part of model.parts) for (const cube of part.cubes) {
    const faces = boxFaces(cube);
    const e = extents(cube), cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2, cz = (e.z0 + e.z1) / 2;
    if (faces.length !== 6) throw new Error(`${mname}.${part.name}: boxFaces returned ${faces.length} faces`);
    for (const f of faces) {
      const want = f.uvs;
      const sr = specRect({ ...cube, mirror: false }, f.face); // f.face names the texture region
      if (f.rect.some((v, i) => v !== sr[i])) throw new Error(`${mname}.${part.name}.${f.face}: rect ${f.rect} != spec ${sr}`);
      // which physical face is it? (the plane all corners share)
      const ax = [0, 1, 2].find(i => f.corners.every(c => Math.abs(c[i] - f.corners[0][i]) < 1e-9));
      const lo = [e.x0, e.y0, e.z0][ax], pos = f.corners[0][ax] > lo + 1e-9;
      const phys = ax === 0 ? (pos ? 'left' : 'right') : ax === 1 ? (pos ? 'top' : 'bottom') : (pos ? 'front' : 'back');
      const nd = FACE_DIRS[phys];
      if (f.normal.some((v, i) => Math.abs(v - nd[i]) > 1e-9)) throw new Error(`${mname}.${part.name}.${f.face}: normal ${f.normal} but lies on ${phys}`);
      f.corners.forEach((c, k) => {
        // nudge toward the face centre so the comparison is unambiguous, then undo the nudge in uv space
        const p = c.map((v, i) => (i === ax ? v : v + ([cx, cy, cz][i] - v) * 1e-6));
        const uv = specUV(cube, phys, p);
        if (Math.abs(uv[0] - want[k][0]) > 1e-3 || Math.abs(uv[1] - want[k][1]) > 1e-3)
          throw new Error(`${mname}.${part.name}.${f.face} corner ${k}: boxFaces uv ${want[k]} != spec ${uv.map(v => v.toFixed(3))}`);
        n++;
      });
      // winding: corners must be counter-clockwise seen from outside (normal . (e1 x e2) > 0)
      const [a, b, c] = f.corners, e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dot = cr[0] * nd[0] + cr[1] * nd[1] + cr[2] * nd[2];
      if (!(dot > 0)) throw new Error(`${mname}.${part.name}.${f.face}: corners not counter-clockwise from outside`);
    }
  }
  return n;
}

// Every texel a model can show must be painted unless the texture deliberately has holes there.
// Returns 'part clear/total' for parts with transparent texels (expected only for overlays/cutouts).
function coverage(model, texName) {
  const t = textures[texName], holes = [];
  for (const part of model.parts) {
    let clear = 0, total = 0;
    for (const cube of part.cubes) for (const face of Object.keys(FACE_DIRS)) {
      const [a, b, c, d] = specRect(cube, face);
      if (a < 0 || b < 0 || c > t.w || d > t.h) throw new Error(`${texName}: ${part.name}.${face} uv rect out of bounds`);
      for (let v = b; v < d; v++) for (let u = a; u < c; u++) { total++; if (t.data[(v * t.w + u) * 4 + 3] < 26) clear++; }
    }
    if (clear) holes.push(`${part.name} ${clear}/${total}`);
  }
  return holes;
}

// ---- software rasterizer
const D2R = Math.PI / 180;
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xn = (m, n) => [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]];

// world -> view: rotate by yaw about Y then pitch about X; camera looks down -Z (bigger z = closer).
function viewOf(yawDeg, pitchDeg) {
  const cy = Math.cos(yawDeg * D2R), sy = Math.sin(yawDeg * D2R), cp = Math.cos(pitchDeg * D2R), sp = Math.sin(pitchDeg * D2R);
  return ([x, y, z]) => {
    const x1 = cy * x + sy * z, z1 = -sy * x + cy * z; // Ry(yaw)
    return [x1, cp * y - sp * z1, sp * y + cp * z1];     // Rx(pitch)
  };
}

function modelQuads(model, texName, pose) {
  const mats = partMatrices(model, pose), quads = [];
  for (const part of model.parts) for (const cube of part.cubes) for (const face of Object.keys(FACE_DIRS)) {
    const local = faceCorners(cube, face), m = mats[part.name];
    let normal = xn(m, FACE_DIRS[face]);
    quads.push({ tex: texName || model.texture, cube, face, local, world: local.map(c => xf(m, c)), normal, rect: specRect(cube, face) });
  }
  return quads;
}

function rasterize(layers, view, W, H, s, cx, cy, ground = true) {
  const img = new Uint8ClampedArray(W * H * 4), zb = new Float32Array(W * H).fill(-1e9);
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0, g = ((x >> 3) + (y >> 3)) & 1 ? 52 : 46; img[i * 4] = g; img[i * 4 + 1] = g; img[i * 4 + 2] = g + 8; img[i * 4 + 3] = 255; }
  const proj = (p) => { const v = view(p); return [cx + v[0] * s, cy - v[1] * s, v[2]]; };
  // a,b,c screen points; la,lb,lc cube-local points; sample(local) -> rgb | null
  const tri = (a, b, c, la, lb, lc, sample) => {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * W + x;
      if (z <= zb[i]) continue;
      const col = sample([0, 1, 2].map(k => w0 * la[k] + w1 * lb[k] + w2 * lc[k]));
      if (!col) continue;
      zb[i] = z; img[i * 4] = col[0]; img[i * 4 + 1] = col[1]; img[i * 4 + 2] = col[2];
    }
  };
  const quad = (q, sample) => {
    const p = q.world.map(proj);
    tri(p[0], p[1], p[2], q.local[0], q.local[1], q.local[2], sample);
    tri(p[0], p[2], p[3], q.local[0], q.local[2], q.local[3], sample);
  };
  if (ground) { // ground grid at y=0, 2px cells
    const g = { world: [[-24, 0, -24], [24, 0, -24], [24, 0, 24], [-24, 0, 24]] };
    g.local = g.world;
    quad(g, ([x, , z]) => { const v = ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) ? 120 : 105; return [v, v + 6, v]; });
  }
  for (const { quads, tint = [1, 1, 1] } of layers) for (const q of quads) {
    const tex = textures[q.tex], [n0, n1, n2] = q.normal;
    const shade = n0 * n0 * 0.6 + n1 * n1 * (n1 > 0 ? 1 : 0.5) + n2 * n2 * 0.8; // MC-ish directional shading
    const [ra, rb, rc, rd] = q.rect;
    quad(q, (lp) => {
      let [u, v] = specUV(q.cube, q.face, lp);
      u = Math.min(Math.max(Math.floor(u), ra), rc - 1); v = Math.min(Math.max(Math.floor(v), rb), rd - 1);
      const ti = (v * tex.w + u) * 4;
      if (tex.data[ti + 3] < 26) return null; // alpha-test cutout
      return [tex.data[ti] * shade * tint[0], tex.data[ti + 1] * shade * tint[1], tex.data[ti + 2] * shade * tint[2]];
    });
  }
  return { w: W, h: H, data: img };
}

// ---- run
const checked = checkBoxFaces();
console.log(`boxFaces() agrees with the spec at ${checked} corners (all models)`);

const VIEWS = [[30, 20], [-35, 25], [0, 0], [90, 0], [150, 25], [0, 89.9]];
// A test pose per model (rendered as the last cell, 3/4 view): checks rotation signs and parenting.
// rx < 0 swings a hanging limb forward (+Z); ry > 0 turns the head toward +X (its left).
const WALK = { head: { rot: [0, 30, 0] }, right_arm: { rot: [-45, 0, 0] }, left_arm: { rot: [45, 0, 0] }, right_leg: { rot: [35, 0, 0] }, left_leg: { rot: [-35, 0, 0] } };
const QUAD = { head: { rot: [20, -25, 0] }, leg0: { rot: [30, 0, 0] }, leg1: { rot: [-30, 0, 0] }, leg2: { rot: [-30, 0, 0] }, leg3: { rot: [30, 0, 0] } };
const POSES = {
  player: WALK, skeleton: WALK, zombie: { ...WALK, right_arm: { rot: [-90, 0, 0] }, left_arm: { rot: [-90, 0, 0] } },
  creeper: QUAD, pig: QUAD, cow: QUAD, sheep: { ...QUAD, head: { rot: [60, 0, 0], pos: [0, -9, 0] } }, sheep_wool: { ...QUAD, head: { rot: [60, 0, 0], pos: [0, -9, 0] } },
  spider: { head: { rot: [0, 25, 0] }, leg0: { rot: [0, 20, 10] }, leg1: { rot: [0, -20, -10] } },
  chicken: { head: { rot: [0, 35, 0] }, right_wing: { rot: [0, 0, -60] }, left_wing: { rot: [0, 0, 60] }, right_leg: { rot: [30, 0, 0] }, left_leg: { rot: [-30, 0, 0] } },
  boat: { left_paddle: { rot: [0, 35, -30] }, right_paddle: { rot: [0, -35, 30] } }, minecart: {},
};
// [model, texture override, extra layers [model, texture, tint]]
const JOBS = [
  ['player'], ['zombie'], ['skeleton'], ['creeper'], ['spider', null, [['spider', 'spider_eyes', [1.6, 1.6, 1.6]]]],
  ['pig'], ['cow'], ['sheep', null, [['sheep_wool', 'sheep_fur', [1, 1, 1]]]], ['sheep'], ['sheep_wool'], ['chicken'], ['minecart'],
  ...BOAT_TEXTURES.map(t => ['boat', t]),
];
const only = process.argv.slice(2);
const overview = [];
for (const [name, texName, extra = []] of JOBS) {
  const label = texName && name === 'boat' ? texName : name + (extra.length ? '_layers' : '');
  if (only.length && !only.includes(name) && !only.includes(label)) continue;
  const model = MODELS[name];
  if (!model) throw new Error('missing model ' + name);
  const tn = texName || model.texture, t = textures[tn];
  if (!t) throw new Error('missing texture ' + tn);
  if (t.w !== model.texW || t.h !== model.texH) throw new Error(`${name}: texture ${t.w}x${t.h} != model ${model.texW}x${model.texH}`);
  const names = new Set();
  for (const p of model.parts) { if (names.has(p.name)) throw new Error(`${name}: duplicate part ${p.name}`); if (p.parent && !names.has(p.parent)) throw new Error(`${name}.${p.name}: parent ${p.parent} must come first`); names.add(p.name); }
  const build = (pose) => {
    const L = [{ quads: modelQuads(model, texName, pose) }];
    for (const [m, tx, tint] of extra) L.push({ quads: modelQuads(MODELS[m], tx, pose ? POSES[m] : undefined), tint });
    return L;
  };
  const layers = build();
  let r = 0, ymin = 1e9, ymax = -1e9;
  for (const L of layers) for (const q of L.quads) for (const c of q.world) { r = Math.max(r, Math.hypot(c[0], c[1] - 12, c[2])); ymin = Math.min(ymin, c[1]); ymax = Math.max(ymax, c[1]); }
  const W = Number(process.env.SZ || 220), H = W, s = (W * 0.46) / Math.max(r, 12);
  const imgs = VIEWS.map(([yaw, pitch]) => rasterize(layers, viewOf(yaw, pitch), W, H, s, W / 2, H / 2 + 12 * s * Math.cos(pitch * D2R)));
  const PV = (process.env.POSEVIEW || "30,20").split(",").map(Number);
  if (POSES[name]) imgs.push(rasterize(build(POSES[name]), viewOf(PV[0], PV[1]), W, H, s, W / 2, H / 2 + 12 * s * Math.cos(PV[1] * D2R)));
  const sh = sheet(imgs, 4, 1, 4);
  writePNG(`/tmp/model_${label}.png`, sh.w, sh.h, sh.data, 1);
  overview.push(imgs[0]);
  const holes = coverage(model, tn);
  console.log(`${label.padEnd(16)} parts=${String(model.parts.length).padStart(2)} y=[${ymin.toFixed(2)}, ${ymax.toFixed(2)}]${holes.length ? '  clear texels: ' + holes.join(', ') : ''}`);
}
if (overview.length > 1) { const sh = sheet(overview, 6, 1, 4); writePNG('/tmp/model_all.png', sh.w, sh.h, sh.data, 1); }
