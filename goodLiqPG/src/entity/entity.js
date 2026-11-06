// Entity base with a port of Minecraft's movement + collision (Entity.move / collide / step-up / fluid pushing).
import { BLOCKS, T_FLUID, TYPE_MASK, META_SHIFT, ID } from '../world/blocks.js';

const EPS = 1e-7;
let NEXT_ID = 1;

function clipAxis(boxes, ax, minA, maxA, b, d) {
  // b = [minX,minY,minZ,maxX,maxY,maxZ] of moving box; ax = 0,1,2
  if (Math.abs(d) < EPS) return 0;
  const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
  for (const c of boxes) {
    if (c[o1 + 3] - EPS <= b[o1] || c[o1] + EPS >= b[o1 + 3]) continue;
    if (c[o2 + 3] - EPS <= b[o2] || c[o2] + EPS >= b[o2 + 3]) continue;
    if (d > 0 && c[ax] >= b[ax + 3] - EPS) { const m = c[ax] - b[ax + 3]; if (m < d) d = m; }
    else if (d < 0 && c[ax + 3] <= b[ax] + EPS) { const m = c[ax + 3] - b[ax]; if (m > d) d = m; }
  }
  void minA; void maxA;
  return d;
}

export class Entity {
  constructor(world, w = 0.6, h = 1.8) {
    this.id = NEXT_ID++;
    this.world = world;
    this.width = w; this.height = h;
    this.pos = [0, 0, 0]; this.prevPos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0; this.prevYaw = 0; this.prevPitch = 0;
    this.onGround = false; this.horizontalCollision = false; this.verticalCollision = false;
    this.stepHeight = 0.6;
    this.fallDistance = 0;
    this.inWater = false; this.inLava = false; this.eyeInWater = false; this.waterHeight = 0; this.lavaHeight = 0;
    this.age = 0;
    this.dead = false;
    this.noPhysics = false;
    this.walkDist = 0; this.prevWalkDist = 0; this.moveDist = 0; this.nextStep = 1;
    this.inWeb = false;
    this.collisionScratch = [];
  }
  setPos(x, y, z) { this.pos = [x, y, z]; this.prevPos = [x, y, z]; }
  aabb(p = this.pos) { const hw = this.width / 2; return [p[0] - hw, p[1], p[2] - hw, p[0] + hw, p[1] + this.height, p[2] + hw]; }

  // Returns the actual movement applied.
  move(dx, dy, dz, sneakEdge = false) {
    if (this.noPhysics) { this.pos[0] += dx; this.pos[1] += dy; this.pos[2] += dz; return [dx, dy, dz]; }
    if (this.inWeb) { dx *= 0.25; dy *= 0.05; dz *= 0.25; this.vel = [0, 0, 0]; this.inWeb = false; }
    if (sneakEdge && this.onGround && dy <= 0) [dx, dz] = this.backOffFromEdge(dx, dz);
    const w = this.world;
    let b = this.aabb();
    const ox = dx, oy = dy, oz = dz;
    const boxes = w.getCollisions(Math.min(b[0], b[0] + dx) - 1e-3, Math.min(b[1], b[1] + dy) - 1e-3, Math.min(b[2], b[2] + dz) - 1e-3,
      Math.max(b[3], b[3] + dx) + 1e-3, Math.max(b[4], b[4] + dy) + 1e-3, Math.max(b[5], b[5] + dz) + 1e-3, this.collisionScratch).slice();
    let [mx, my, mz] = this.collideWith(boxes, b, dx, dy, dz);
    // step up
    const wantStep = this.stepHeight > 0 && (this.onGround || (my !== oy && oy < 0)) && (mx !== ox || mz !== oz);
    if (wantStep) {
      const sb = w.getCollisions(Math.min(b[0], b[0] + dx) - 1e-3, b[1] - 1e-3, Math.min(b[2], b[2] + dz) - 1e-3,
        Math.max(b[3], b[3] + dx) + 1e-3, b[4] + this.stepHeight + 1e-3, Math.max(b[5], b[5] + dz) + 1e-3, []).slice();
      let [sx, sy, sz] = this.collideWith(sb, b, ox, this.stepHeight, oz);
      const up = clipAxis(sb, 1, 0, 0, b, this.stepHeight);
      // alternative: go up first then horizontally
      const b2 = [b[0], b[1] + up, b[2], b[3], b[4] + up, b[5]];
      let ax = ox, az = oz;
      if (Math.abs(ax) < Math.abs(az)) { az = clipAxis(sb, 2, 0, 0, b2, az); const b3 = [b2[0], b2[1], b2[2] + az, b2[3], b2[4], b2[5] + az]; ax = clipAxis(sb, 0, 0, 0, b3, ax); }
      else { ax = clipAxis(sb, 0, 0, 0, b2, ax); const b3 = [b2[0] + ax, b2[1], b2[2], b2[3] + ax, b2[4], b2[5]]; az = clipAxis(sb, 2, 0, 0, b3, az); }
      if (ax * ax + az * az > sx * sx + sz * sz) { sx = ax; sz = az; sy = up; }
      // settle back down
      const b4 = [b[0] + sx, b[1] + sy, b[2] + sz, b[3] + sx, b[4] + sy, b[5] + sz];
      const down = clipAxis(sb, 1, 0, 0, b4, -sy + (oy < 0 ? oy : 0));
      sy += down;
      if (sx * sx + sz * sz > mx * mx + mz * mz + 1e-9) { mx = sx; my = sy; mz = sz; }
    }
    this.pos[0] += mx; this.pos[1] += my; this.pos[2] += mz;
    this.horizontalCollision = Math.abs(mx - ox) > 1e-5 || Math.abs(mz - oz) > 1e-5;
    this.verticalCollision = my !== oy;
    const wasOnGround = this.onGround;
    this.onGround = this.verticalCollision && oy < 0;
    if (Math.abs(mx - ox) > 1e-5) this.vel[0] = 0;
    if (Math.abs(mz - oz) > 1e-5) this.vel[2] = 0;
    if (my !== oy) this.vel[1] = 0;
    // fall distance
    if (this.onGround) {
      if (this.fallDistance > 0) this.onLand(this.fallDistance, wasOnGround);
      this.fallDistance = 0;
    } else if (my < 0) this.fallDistance -= my;
    const hd = Math.hypot(mx, mz);
    this.walkDist += hd * 0.6;
    this.moveDist += Math.hypot(mx, my, mz) * 0.6;
    return [mx, my, mz];
  }

  collideWith(boxes, b, dx, dy, dz) {
    b = b.slice();
    dy = clipAxis(boxes, 1, 0, 0, b, dy); b[1] += dy; b[4] += dy;
    if (Math.abs(dx) < Math.abs(dz)) {
      dz = clipAxis(boxes, 2, 0, 0, b, dz); b[2] += dz; b[5] += dz;
      dx = clipAxis(boxes, 0, 0, 0, b, dx);
    } else {
      dx = clipAxis(boxes, 0, 0, 0, b, dx); b[0] += dx; b[3] += dx;
      dz = clipAxis(boxes, 2, 0, 0, b, dz);
    }
    return [dx, dy, dz];
  }

  // Player.maybeBackOffFromEdge
  backOffFromEdge(dx, dz) {
    const step = 0.05;
    const free = (ox, oz) => {
      const b = this.aabb();
      const boxes = this.world.getCollisions(b[0] + ox, b[1] - this.stepHeight - 1e-3, b[2] + oz, b[3] + ox, b[1] - 1e-3, b[5] + oz, []);
      return boxes.length === 0;
    };
    while (dx !== 0 && free(dx, 0)) { if (dx < step && dx >= -step) dx = 0; else if (dx > 0) dx -= step; else dx += step; }
    while (dz !== 0 && free(0, dz)) { if (dz < step && dz >= -step) dz = 0; else if (dz > 0) dz -= step; else dz += step; }
    while (dx !== 0 && dz !== 0 && free(dx, dz)) {
      if (dx < step && dx >= -step) dx = 0; else if (dx > 0) dx -= step; else dx += step;
      if (dz < step && dz >= -step) dz = 0; else if (dz > 0) dz -= step; else dz += step;
    }
    return [dx, dz];
  }

  onLand(dist) { void dist; }

  // Fluid state + pushing (Entity.updateFluidHeightAndDoFluidPushing)
  updateFluids() {
    const b = this.aabb();
    const w = this.world;
    const x0 = Math.floor(b[0] + 0.001), x1 = Math.floor(b[3] - 0.001), y0 = Math.floor(b[1] + 0.001), y1 = Math.floor(b[4] - 0.001), z0 = Math.floor(b[2] + 0.001), z1 = Math.floor(b[5] - 0.001);
    let waterH = 0, lavaH = 0;
    const push = [0, 0, 0]; let pushN = 0;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const v = w.getBlock(x, y, z);
      const t = v & TYPE_MASK;
      const ft = T_FLUID[t];
      if (!ft) { if (t === ID.cobweb) this.inWeb = true; continue; }
      const above = w.getBlock(x, y + 1, z);
      const h = (T_FLUID[above & TYPE_MASK] === ft) ? 1 : fluidHeight(v);
      const top = y + h;
      if (top < b[1] + 0.001) continue;
      const depth = top - b[1];
      if (ft === 1) {
        waterH = Math.max(waterH, depth);
        const f = flowVector(w, x, y, z, v);
        if (depth < 0.4) { f[0] *= depth; f[1] *= depth; f[2] *= depth; }
        push[0] += f[0]; push[1] += f[1]; push[2] += f[2]; pushN++;
      } else lavaH = Math.max(lavaH, depth);
    }
    this.waterHeight = waterH; this.lavaHeight = lavaH;
    this.inWater = waterH > 0; this.inLava = lavaH > 0;
    if (pushN > 0 && this.pushedByFluid !== false) {
      let p = [push[0] / pushN, push[1] / pushN, push[2] / pushN];
      let l = Math.hypot(p[0], p[1], p[2]);
      if (l > 0) {
        if (!this.isPlayer) p = p.map(v => v / l);
        p = p.map(v => v * 0.014);
        l = Math.hypot(p[0], p[1], p[2]);
        if (Math.abs(this.vel[0]) < 0.003 && Math.abs(this.vel[2]) < 0.003 && l < 0.0045) p = p.map(v => v / l * 0.0045);
        this.vel[0] += p[0]; this.vel[1] += p[1]; this.vel[2] += p[2];
      }
    }
    if (this.inWater) this.fallDistance = 0;
    if (this.inLava) this.fallDistance *= 0.5;
  }

  eyeHeight() { return this.height * 0.85; }
  eyeFluid() {
    const ey = this.pos[1] + this.eyeHeight();
    const x = Math.floor(this.pos[0]), y = Math.floor(ey), z = Math.floor(this.pos[2]);
    const v = this.world.getBlock(x, y, z);
    const ft = T_FLUID[v & TYPE_MASK];
    if (!ft) return 0;
    const above = this.world.getBlock(x, y + 1, z);
    const h = T_FLUID[above & TYPE_MASK] === ft ? 1 : fluidHeight(v);
    return ey < y + h ? ft : 0;
  }

  blockBelow() {
    return this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.5000001), Math.floor(this.pos[2]));
  }
  isClimbing() {
    const v = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
    return BLOCKS[v & TYPE_MASK].climbable;
  }
  tick() { this.age++; }
  lerpPos(pt) { return [this.prevPos[0] + (this.pos[0] - this.prevPos[0]) * pt, this.prevPos[1] + (this.pos[1] - this.prevPos[1]) * pt, this.prevPos[2] + (this.pos[2] - this.prevPos[2]) * pt]; }
}

export function fluidHeight(v) {
  const b = BLOCKS[v & TYPE_MASK];
  if (b.waterlogged) return 8 / 9;
  const m = v >>> META_SHIFT;
  if (m & 8) return 8 / 9;
  return (8 - (m & 7)) / 9;
}

// approximate FlowingFluid.getFlow
export function flowVector(w, x, y, z, v) {
  const ft = T_FLUID[v & TYPE_MASK];
  const amt = (vv) => { const t = vv & TYPE_MASK; if (T_FLUID[t] !== ft) return -1; if (BLOCKS[t].waterlogged) return 8; const m = vv >>> META_SHIFT; return m & 8 ? 8 : 8 - (m & 7); };
  const own = amt(v);
  let fx = 0, fz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = w.getBlock(x + dx, y, z + dz);
    let a = amt(n);
    if (a < 0) {
      const t = n & TYPE_MASK;
      if (!BLOCKS[t].solid) { const nb = w.getBlock(x + dx, y - 1, z + dz); const ab = amt(nb); if (ab >= 0) { const d = own - (ab - 8); fx += dx * d; fz += dz * d; } }
      continue;
    }
    const d = own - a;
    fx += dx * d; fz += dz * d;
  }
  let fy = 0;
  if ((v >>> META_SHIFT) & 8) fy = -6;
  const l = Math.hypot(fx, fy, fz);
  return l > 0 ? [fx / l, fy / l, fz / l] : [0, 0, 0];
}
