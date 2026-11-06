// Entity box models (Java Edition 1.20 geometry), recreated as plain data.
//
// Space: units are pixels (1/16 block), +Y up, origin = the entity's position (feet centre on the ground),
// the creature FACES +Z. Its right-hand side is -X, its left-hand side is +X.
// (Java ModelPart space converts as x' = x, y' = 24 - y, z' = -z; rotations as rx' = rx, ry' = -ry, rz' = -rz.)
//
// Exports: MODELS, BOAT_TEXTURES, boxFaces(cube), partMatrices(model, pose), eulerZYX(rx, ry, rz).
//
// Model = { texture, texW, texH, parts: Part[] (parents listed before children), scale? }
// Part  = { name, parent?, pivot:[x,y,z], rotation?:[rxDeg,ryDeg,rzDeg], cubes: Cube[] }
// Cube  = { from:[x,y,z], size:[w,h,d], uv:[u,v], inflate?, mirror? }
//   - pivot/from are absolute model-space coordinates of the UNROTATED rest frame. A vertex q of a part is
//     transformed as  M(part) * q  with  M(part) = M(parent) * T(pivot) * R(rotation) * T(-pivot).
//     Animation rotations are meant to be ADDED to the rest `rotation` (that is how vanilla poses spider legs).
//   - Euler order is Java's: R = Rz * Ry * Rx (X applied first) == three.js Euler order 'ZYX'.
//     Positive angles are right-handed (counter-clockwise looking down the axis toward the origin):
//     rx>0 tips +Y toward +Z (so an arm with rx = -90 points forward), ry>0 turns +Z toward +X.
//   - inflate grows the box by that amount on every side; UVs are unchanged (texture is stretched).
//   - scale (optional, player only) is the uniform scale vanilla's renderer applies (15/16 for players).
//
// Box UV (standard Minecraft layout) for size (w,h,d) at uv (u,v); see boxFaces() for exact corner order:
//   top    (+Y) (u+d,     v)   w x d   texture-up = back (-Z),  texture-right = +X
//   bottom (-Y) (u+d+w,   v)   w x d   same orientation as top (as seen from above)
//   right  (-X) (u,       v+d) d x h   texture-right = front (+Z), texture-up = +Y
//   front  (+Z) (u+d,     v+d) w x h   texture-right = +X (creature's left) -> looks right when facing it
//   left   (+X) (u+d+w,   v+d) d x h   texture-right = back (-Z)
//   back   (-Z) (u+2d+w,  v+d) w x h   texture-right = -X
//   mirror:true mirrors the whole textured box in X (Java behaviour): the region normally used for the
//   -X side lands on +X and every face's texture is flipped horizontally.
//
// Deviations from vanilla UVs (geometry is exact): bodies that vanilla builds vertical and rotates 90 degrees
// about X (pig, cow, sheep, sheep_wool, chicken) are baked into horizontal boxes with no rest rotation, so
// their body (and the cow's udder) use new UV spots - see the comments; those textures are 64x64. The boat
// floor and paddles are baked the same way (custom 128x64 layout). The minecart and boat are turned so
// they are long along Z (travel direction = +Z like every other entity).
// Cutout: textures use alpha 0 for holes (skeleton ribs, chicken legs, overlay layers). Render with alpha
// test and no back-face culling (vanilla uses entityCutoutNoCull).

const C = (from, size, uv, opt) => (opt ? { from, size, uv, ...opt } : { from, size, uv });

function biped(texture, texH, { hatLayer = true, mirrorLeft = true, armW = 4, legX = 1.9, leftArmUV = [40, 16], leftLegUV = [0, 16] } = {}) {
  const m = mirrorLeft ? { mirror: true } : undefined;
  const aw = armW, lw = armW;
  const parts = [
    { name: 'head', pivot: [0, 24, 0], cubes: [C([-4, 24, -4], [8, 8, 8], [0, 0])] },
  ];
  if (hatLayer) parts.push({ name: 'hat', parent: 'head', pivot: [0, 24, 0], cubes: [C([-4, 24, -4], [8, 8, 8], [32, 0], { inflate: 0.5 })] });
  parts.push(
    { name: 'body', pivot: [0, 24, 0], cubes: [C([-4, 12, -2], [8, 12, 4], [16, 16])] },
    // arms hang from the shoulder pivot (+-5, 22); their inner face is flush with the body side (x = +-4)
    { name: 'right_arm', pivot: [-5, 22, 0], cubes: [C([-4 - aw, 12, -aw / 2], [aw, 12, aw], [40, 16])] },
    { name: 'left_arm', pivot: [5, 22, 0], cubes: [C([4, 12, -aw / 2], [aw, 12, aw], leftArmUV, m)] },
    { name: 'right_leg', pivot: [-legX, 12, 0], cubes: [C([-legX - lw / 2, 0, -lw / 2], [lw, 12, lw], [0, 16])] },
    { name: 'left_leg', pivot: [legX, 12, 0], cubes: [C([legX - lw / 2, 0, -lw / 2], [lw, 12, lw], leftLegUV, m)] },
  );
  return { texture, texW: 64, texH, parts };
}

function player() {
  const m = biped('player', 64, { mirrorLeft: false, leftArmUV: [32, 48], leftLegUV: [16, 48] });
  const byName = Object.fromEntries(m.parts.map(p => [p.name, p]));
  const overlay = (name, base, uv) => {
    const b = byName[base];
    return { name, parent: base, pivot: b.pivot.slice(), cubes: [C(b.cubes[0].from.slice(), b.cubes[0].size.slice(), uv, { inflate: 0.25 })] };
  };
  m.parts = [
    byName.head, byName.hat,
    byName.body, overlay('jacket', 'body', [16, 32]),
    byName.right_arm, overlay('right_sleeve', 'right_arm', [40, 32]),
    byName.left_arm, overlay('left_sleeve', 'left_arm', [48, 48]),
    byName.right_leg, overlay('right_pants', 'right_leg', [0, 32]),
    byName.left_leg, overlay('left_pants', 'left_leg', [0, 48]),
  ];
  m.scale = 0.9375;
  return m;
}

// Quadruped legs: leg0 = back-right, leg1 = back-left, leg2 = front-right, leg3 = front-left.
function quadLegs(x, backZ, frontZ, h, uv = [0, 16], extra) {
  const leg = (name, px, pz) => ({ name, pivot: [px, h, pz], cubes: [C([px - 2, 0, pz - 2], [4, h, 4], uv, extra)] });
  return [leg('leg0', -x, backZ), leg('leg1', x, backZ), leg('leg2', -x, frontZ), leg('leg3', x, frontZ)];
}

// Spider legs: even = right side (-X), odd = left side (+X); 0/1 hind ... 6/7 front.
function spiderLegs() {
  const f = 45, f1 = 22.5, m = 45 * 0.74; // vanilla: PI/4, PI/8, PI/4*0.74
  const defs = [
    // [z (ours), ry, |rz|]  (right side; left side mirrors ry and rz)
    [-2, -f, f], [-1, -f1, m], [0, f1, m], [1, f, f],
  ];
  const legs = [];
  defs.forEach(([z, ry, rz], i) => {
    legs.push({ name: 'leg' + (2 * i), pivot: [-4, 9, z], rotation: [0, ry, rz], cubes: [C([-19, 8, z - 1], [16, 2, 2], [18, 0])] });
    legs.push({ name: 'leg' + (2 * i + 1), pivot: [4, 9, z], rotation: [0, -ry, -rz], cubes: [C([3, 8, z - 1], [16, 2, 2], [18, 0], { mirror: true })] });
  });
  return legs;
}

export const MODELS = {
  player: player(),

  // Vanilla ZombieModel = HumanoidModel mesh on a 64x64 texture, left limbs mirror the right ones.
  zombie: biped('zombie', 64),

  // SkeletonModel: humanoid head/body, 2px limbs; the 'hat' cube of the humanoid mesh is unused (transparent).
  skeleton: biped('skeleton', 32, { hatLayer: false, armW: 2, legX: 2 }),

  creeper: {
    texture: 'creeper', texW: 64, texH: 32, parts: [
      { name: 'head', pivot: [0, 18, 0], cubes: [C([-4, 18, -4], [8, 8, 8], [0, 0])] },
      { name: 'body', pivot: [0, 18, 0], cubes: [C([-4, 6, -2], [8, 12, 4], [16, 16])] },
      ...[['leg0', -2, -4], ['leg1', 2, -4], ['leg2', -2, 4], ['leg3', 2, 4]].map(([name, x, z]) =>
        ({ name, pivot: [x, 6, z], cubes: [C([x - 2, 0, z - 2], [4, 6, 4], [0, 16])] })),
    ],
  },

  spider: {
    texture: 'spider', texW: 64, texH: 32, parts: [
      { name: 'head', pivot: [0, 9, 3], cubes: [C([-4, 5, 3], [8, 8, 8], [32, 4])] },
      { name: 'neck', pivot: [0, 9, 0], cubes: [C([-3, 6, -3], [6, 6, 6], [0, 0])] },
      { name: 'body', pivot: [0, 9, -9], cubes: [C([-5, 5, -15], [10, 8, 12], [0, 12])] },
      ...spiderLegs(),
    ],
  },

  // Pig: vanilla body is 10x16x8 rotated 90deg about X -> baked to 10 wide, 8 tall, 16 long; body UV moved to (0,32).
  pig: {
    texture: 'pig', texW: 64, texH: 64, parts: [
      { name: 'head', pivot: [0, 12, 6], cubes: [C([-4, 8, 6], [8, 8, 8], [0, 0]), C([-2, 9, 14], [4, 3, 1], [16, 16])] },
      { name: 'body', pivot: [0, 13, -2], cubes: [C([-5, 6, -8], [10, 8, 16], [0, 32])] },
      ...quadLegs(3, -7, 5, 6),
    ],
  },

  // Cow: head 8x8x6 with two 1x3x1 horns; body 12x10x18 (baked, UV (0,32)); udder 4x1x6 under the rear (UV (32,0)).
  cow: {
    texture: 'cow', texW: 64, texH: 64, parts: [
      { name: 'head', pivot: [0, 20, 8], cubes: [
        C([-4, 16, 8], [8, 8, 6], [0, 0]),
        C([-5, 22, 11], [1, 3, 1], [22, 0]),
        C([4, 22, 11], [1, 3, 1], [22, 0]),
      ] },
      { name: 'body', pivot: [0, 19, -2], cubes: [C([-6, 12, -10], [12, 10, 18], [0, 32]), C([-2, 11, -10], [4, 1, 6], [32, 0])] },
      ...quadLegs(4, -7, 6, 12),
    ],
  },

  // Sheared sheep (texture 'sheep'); body 8x6x16 baked, UV (0,32).
  sheep: {
    texture: 'sheep', texW: 64, texH: 64, parts: [
      { name: 'head', pivot: [0, 18, 8], cubes: [C([-3, 16, 6], [6, 6, 8], [0, 0])] },
      { name: 'body', pivot: [0, 19, -2], cubes: [C([-4, 12, -8], [8, 6, 16], [0, 32])] },
      ...quadLegs(3, -7, 5, 12),
    ],
  },

  // Wool layer drawn over 'sheep' with the same pose (texture 'sheep_fur', tinted by the fleece colour).
  sheep_wool: {
    texture: 'sheep_fur', texW: 64, texH: 64, parts: [
      { name: 'head', pivot: [0, 18, 8], cubes: [C([-3, 16, 6], [6, 6, 6], [0, 0], { inflate: 0.6 })] },
      { name: 'body', pivot: [0, 19, -2], cubes: [C([-4, 12, -8], [8, 6, 16], [0, 32], { inflate: 1.75 })] },
      ...quadLegs(3, -7, 5, 12).map(p => ({ ...p, cubes: [C([p.pivot[0] - 2, 6, p.pivot[2] - 2], [4, 6, 4], [0, 16], { inflate: 0.5 })] })),
    ],
  },

  // Chicken: beak and red_thing (wattle) are children of head (vanilla copies the head rotation onto them).
  // Body (vanilla 6x8x6 rotated about X) baked to 6 wide, 6 tall, 8 long at UV (0,18).
  // Legs are 3x5x3 boxes whose texture is mostly transparent (a 1px leg + toes).
  chicken: {
    texture: 'chicken', texW: 64, texH: 32, parts: [
      { name: 'head', pivot: [0, 9, 4], cubes: [C([-2, 9, 3], [4, 6, 3], [0, 0])] },
      { name: 'beak', parent: 'head', pivot: [0, 9, 4], cubes: [C([-2, 11, 6], [4, 2, 2], [14, 0])] },
      { name: 'red_thing', parent: 'head', pivot: [0, 9, 4], cubes: [C([-1, 9, 5], [2, 2, 2], [14, 4])] },
      { name: 'body', pivot: [0, 8, 0], cubes: [C([-3, 5, -4], [6, 6, 8], [0, 18])] },
      { name: 'right_wing', pivot: [-4, 11, 0], cubes: [C([-4, 7, -3], [1, 4, 6], [24, 13])] },
      { name: 'left_wing', pivot: [4, 11, 0], cubes: [C([3, 7, -3], [1, 4, 6], [24, 13])] },
      { name: 'right_leg', pivot: [-2, 5, -1], cubes: [C([-3, 0, -1], [3, 5, 3], [26, 0])] },
      { name: 'left_leg', pivot: [1, 5, -1], cubes: [C([0, 0, -1], [3, 5, 3], [26, 0])] },
    ],
  },

  // Minecart (vanilla MinecartModel, 20 long x 16 wide x 11 tall, open top). Origin = entity position
  // (vanilla: on the rail, 1/16 above the rail block's floor); floor spans y 1..3, walls y 3..11.
  // Walls are the vanilla 16x8x2 box (uv 0,0) turned with single-axis Y rotations; the vanilla floor box is
  // 20x16x2 at uv (0,10) - here it is a 16x20x2 box at uv (0,10) tipped by rx = 90 (custom UV).
  // In every wall the box's +Z ("front") texture faces INTO the cart, the "back" texture faces outward.
  minecart: {
    texture: 'minecart', texW: 64, texH: 32, parts: [
      { name: 'bottom', pivot: [0, 2, 0], rotation: [90, 0, 0], cubes: [C([-8, -8, -1], [16, 20, 2], [0, 10])] },
      { name: 'front', pivot: [0, 2, 9], rotation: [0, 180, 0], cubes: [C([-8, 3, 8], [16, 8, 2], [0, 0])] },
      { name: 'back', pivot: [0, 2, -9], cubes: [C([-8, 3, -10], [16, 8, 2], [0, 0])] },
      { name: 'right', pivot: [-7, 2, 0], rotation: [0, 90, 0], cubes: [C([-15, 3, -1], [16, 8, 2], [0, 0])] },
      { name: 'left', pivot: [7, 2, 0], rotation: [0, -90, 0], cubes: [C([-1, 3, -1], [16, 8, 2], [0, 0])] },
    ],
  },

  // Boat (vanilla BoatModel geometry, 128x64 texture). Origin = entity position; hull floor y 0..3,
  // walls y 3..9, bow at +Z. Custom UV layout (all boat_* textures share it):
  //   bottom 16x3x28 @(0,0) (top face = inner floor), back 18x6x2 @(0,31), front 16x6x2 @(40,31) (ry 180),
  //   right 28x6x2 @(0,39) (ry 90), left 28x6x2 @(60,39) (ry -90); walls' "front" texture faces inward.
  //   Paddles: shaft 18x2x2 (left @(88,0), right @(88,4)) + blade 7x6x1 (left @(88,8), right @(104,8)),
  //   baked to point straight out sideways from the oarlocks at (+-9, 11, 3) with vanilla's 11.25deg roll.
  //   Exact vanilla rowing (xRot=a, yRot=b from BoatModel.animatePaddle) in this space is
  //   left: R = Rx(11.25) * Ry(-b) * Rz(a),  right: R = Rx(11.25) * Ry(b) * Rz(-a)   (Rz applied first).
  boat: {
    texture: 'boat_oak', texW: 128, texH: 64, parts: [
      { name: 'bottom', pivot: [0, 3, 0], cubes: [C([-8, 0, -14], [16, 3, 28], [0, 0])] },
      { name: 'back', pivot: [0, 6, -15], cubes: [C([-9, 3, -16], [18, 6, 2], [0, 31])] },
      { name: 'front', pivot: [0, 6, 15], rotation: [0, 180, 0], cubes: [C([-8, 3, 14], [16, 6, 2], [40, 31])] },
      { name: 'right', pivot: [-9, 6, 0], rotation: [0, 90, 0], cubes: [C([-23, 3, -1], [28, 6, 2], [0, 39])] },
      { name: 'left', pivot: [9, 6, 0], rotation: [0, -90, 0], cubes: [C([-5, 3, -1], [28, 6, 2], [60, 39])] },
      { name: 'left_paddle', pivot: [9, 11, 3], rotation: [11.25, 0, 0], cubes: [
        C([4, 9, 2], [18, 2, 2], [88, 0]), C([17, 8, 1.999], [7, 6, 1], [88, 8]),
      ] },
      { name: 'right_paddle', pivot: [-9, 11, 3], rotation: [11.25, 0, 0], cubes: [
        C([-22, 9, 2], [18, 2, 2], [88, 4]), C([-24, 8, 1.999], [7, 6, 1], [104, 8]),
      ] },
    ],
  },
};

// Boat wood variants sharing MODELS.boat (swap model.texture).
export const BOAT_TEXTURES = ['boat_oak', 'boat_spruce', 'boat_birch', 'boat_jungle', 'boat_acacia', 'boat_dark_oak', 'boat_cherry'];

// ---------------------------------------------------------------------------------------------------
// Helpers (shared by renderers and tools/preview_entities.mjs).

// The six textured quads of a cube in part-local (rest) space.
// Returns [{ face, normal:[x,y,z], corners:[4 x [x,y,z]], uvs:[4 x [u,v]], rect:[u0,v0,u1,v1] }]
//   corners are counter-clockwise seen from outside (GL front face): draw triangles (0,1,2) and (0,2,3);
//   uvs[i] is the texture coordinate of corners[i] in texture PIXELS (v down; divide by texW/texH);
//   rect is the face's texel rectangle (u0<u1, v0<v1); face is the texture region name ('right' etc.).
// With mirror the positions are reflected in X (the 'right' region then lies on +X) and the texture
// appears flipped, exactly like Java's mirror flag.
export function boxFaces(cube) {
  const [w, h, d] = cube.size, [u, v] = cube.uv, g = cube.inflate || 0;
  const x0 = cube.from[0] - g, y0 = cube.from[1] - g, z0 = cube.from[2] - g;
  const x1 = cube.from[0] + w + g, y1 = cube.from[1] + h + g, z1 = cube.from[2] + d + g;
  const F = [
    ['top', [0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [u + d, v, u + d + w, v + d]],
    ['bottom', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [u + d + w, v, u + d + 2 * w, v + d]],
    ['right', [-1, 0, 0], [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], [u, v + d, u + d, v + d + h]],
    ['front', [0, 0, 1], [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], [u + d, v + d, u + d + w, v + d + h]],
    ['left', [1, 0, 0], [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], [u + d + w, v + d, u + 2 * d + w, v + d + h]],
    ['back', [0, 0, -1], [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h]],
  ];
  // corners above are listed in texture order TL,TR,BR,BL; reorder to counter-clockwise if needed.
  return F.map(([face, n, c, rect]) => {
    const [u0, v0, u1, v1] = rect;
    if (cube.mirror) { c = c.map(([x, y, z]) => [x0 + x1 - x, y, z]); n = [-n[0], n[1], n[2]]; }
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]], e2 = [c[2][0] - c[0][0], c[2][1] - c[0][1], c[2][2] - c[0][2]];
    const ccw = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] > 0;
    return ccw
      ? { face, normal: n, corners: c, uvs: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], rect }
      : { face, normal: n, corners: [c[0], c[3], c[2], c[1]], uvs: [[u0, v0], [u0, v1], [u1, v1], [u1, v0]], rect };
  });
}

// Column-major 4x4 (WebGL layout) helpers.
const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
};
const D2R = Math.PI / 180;
// R = Rz * Ry * Rx (angles in degrees) as a column-major 4x4.
export function eulerZYX(rx, ry, rz) {
  const a = rx * D2R, b = ry * D2R, c = rz * D2R;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // rows of Rz*Ry*Rx
  const m00 = cc * cb, m01 = cc * sb * sa - sc * ca, m02 = cc * sb * ca + sc * sa;
  const m10 = sc * cb, m11 = sc * sb * sa + cc * ca, m12 = sc * sb * ca - cc * sa;
  const m20 = -sb, m21 = cb * sa, m22 = cb * ca;
  return [m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, 0, 0, 0, 1];
}

// World matrices of every part. pose[name] = { rot?:[dx,dy,dz] degrees added to the rest rotation,
// pos?:[dx,dy,dz] pixels added to the pivot }. Returns { [name]: 16-number column-major array }.
export function partMatrices(model, pose = {}) {
  const out = {};
  const byName = Object.fromEntries(model.parts.map(p => [p.name, p]));
  const get = (name) => {
    if (out[name]) return out[name];
    const p = byName[name], q = pose[name] || {};
    const r0 = p.rotation || [0, 0, 0], dr = q.rot || [0, 0, 0], dp = q.pos || [0, 0, 0];
    const [px, py, pz] = p.pivot;
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, px + dp[0], py + dp[1], pz + dp[2], 1];
    const Ti = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -px, -py, -pz, 1];
    let m = mul(mul(T, eulerZYX(r0[0] + dr[0], r0[1] + dr[1], r0[2] + dr[2])), Ti);
    if (p.parent) m = mul(get(p.parent), m);
    return (out[name] = m);
  };
  for (const p of model.parts) get(p.name);
  return out;
}
