/* gode/main/phys.js —— 移动与碰撞（M1-1）：宿主 B `Physics`（index.html:1464）+ 玩家控制器 `Player.update`（:1668）的搬运，去掉生存 / 摔伤 / 梯子 / 视角晃动，
   改读 gode 的权威世界（World.get）与方块表（glTable 的 solid / fluid，按名字来，s04）。
   常量照宿主 B：重力 32、终速 78、起跳 8.4、走 4.517 / 疾跑 5.812 / 潜行 1.31、飞行 10.9（Shift / Ctrl ×2）、阶梯 0.6、自动跳。
   飞行：双击空格开关，空格升 / 潜行降，落地时按潜行退出；noclip + 飞行穿墙。未加载的区块当实心（防止掉进虚空），同宿主 B。 */
const floor = Math.floor;
export const GRAVITY = 32, TERMINAL = 78, JUMP_VEL = 8.4;
export const c_Motion = { autoJumpReach: 0.25, autoJumpSprint: 1.65, flySpeed: 10.9, sens: 0.0022 };

export class Physics {
  constructor(world, tbl) { this.world = world; this.tbl = tbl; this._boxes = []; }

  // 与 AABB 相交的实心方块盒（世界坐标）。未加载 = 实心；y < 0 = 虚空地板
  collectBoxes(minx, miny, minz, maxx, maxy, maxz) {
    const out = this._boxes; out.length = 0;
    const W = this.world, solid = this.tbl.solid;
    const x0 = floor(minx), x1 = floor(maxx), y0 = Math.max(0, floor(miny)), y1 = Math.min(255, floor(maxy)), z0 = floor(minz), z1 = floor(maxz);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const c = W.chunk(x >> 4, z >> 4), ci = ((z & 15) << 4) | (x & 15);
      for (let y = y0; y <= y1; y++) {
        if (!c) { out.push(x, y, z, x + 1, y + 1, z + 1); continue; }
        if (solid[c.blocks[(y << 8) | ci] & 0xfff]) out.push(x, y, z, x + 1, y + 1, z + 1);
      }
    }
    if (miny < 0) out.push(x0 - 1, -2, z0 - 1, x1 + 2, 0, z1 + 2);
    return out;
  }

  // 沿一根轴扫：返回允许的位移
  sweep(e, axis, d, boxes) {
    if (d === 0) return 0;
    const EPS = 1e-4;
    const minx = e.x - e.w, maxx = e.x + e.w, miny = e.y, maxy = e.y + e.h, minz = e.z - e.w, maxz = e.z + e.w;
    for (let i = 0; i < boxes.length; i += 6) {
      const bx0 = boxes[i], by0 = boxes[i + 1], bz0 = boxes[i + 2], bx1 = boxes[i + 3], by1 = boxes[i + 4], bz1 = boxes[i + 5];
      if (axis !== 0 && (bx1 <= minx + EPS || bx0 >= maxx - EPS)) continue;
      if (axis !== 1 && (by1 <= miny + EPS || by0 >= maxy - EPS)) continue;
      if (axis !== 2 && (bz1 <= minz + EPS || bz0 >= maxz - EPS)) continue;
      const emin = axis === 0 ? minx : axis === 1 ? miny : minz, emax = axis === 0 ? maxx : axis === 1 ? maxy : maxz;
      const bmin = axis === 0 ? bx0 : axis === 1 ? by0 : bz0, bmax = axis === 0 ? bx1 : axis === 1 ? by1 : bz1;
      if (d > 0 && bmin >= emax - EPS) d = Math.min(d, bmin - emax - EPS);
      else if (d < 0 && bmax <= emin + EPS) d = Math.max(d, bmax - emin + EPS);
    }
    return d;
  }

  intersects(e) {
    const b = this.collectBoxes(e.x - e.w, e.y, e.z - e.w, e.x + e.w, e.y + e.h, e.z + e.w);
    for (let i = 0; i < b.length; i += 6) if (b[i] < e.x + e.w && b[i + 3] > e.x - e.w && b[i + 1] < e.y + e.h && b[i + 4] > e.y && b[i + 2] < e.z + e.w && b[i + 5] > e.z - e.w) return true;
    return false;
  }
  // 卡进方块：传送到同一列最近的空位（同距先上）
  unstuck(e) {
    if (!this.intersects(e)) return false;
    for (let d = 1; d < 256; d++) for (const y of [floor(e.y) + d, floor(e.y) - d])
      if (y >= 0 && y < 256 && !this.intersects({ x: e.x, y, z: e.z, w: e.w - 1e-3, h: e.h })) { e.y = y; e.vy = 0; e.fallStart = y; return true; }
    return false;
  }

  // 带碰撞地移动：设置 e.onGround / hitX / hitZ；上台阶（stepHeight）与潜行不掉边
  move(e, dx, dy, dz) {
    const pad = 1.0;
    const boxes = this.collectBoxes(e.x - e.w - Math.abs(dx) - pad, e.y - Math.abs(dy) - pad, e.z - e.w - Math.abs(dz) - pad, e.x + e.w + Math.abs(dx) + pad, e.y + e.h + Math.abs(dy) + pad, e.z + e.w + Math.abs(dz) + pad);
    const wasOnGround = e.onGround, sx = e.x, sy = e.y, sz = e.z;
    const ady = this.sweep(e, 1, dy, boxes); e.y += ady;
    if (ady !== dy) { if (dy < 0) e.onGround = true; e.vy = 0; } else e.onGround = false;
    if (dy < 0 && ady === dy) e.onGround = false;
    const adx = this.sweep(e, 0, dx, boxes); e.x += adx;
    const adz = this.sweep(e, 2, dz, boxes); e.z += adz;
    e.hitX = adx !== dx; e.hitZ = adz !== dz;
    if ((e.hitX || e.hitZ) && (wasOnGround || e.onGround) && e.stepHeight > 0 && !e.noStep) {
      const px = e.x, py = e.y, pz = e.z;
      e.x = sx; e.y = sy + ady; e.z = sz;
      const up = this.sweep(e, 1, e.stepHeight, boxes); e.y += up;
      const tdx = this.sweep(e, 0, dx, boxes); e.x += tdx;
      const tdz = this.sweep(e, 2, dz, boxes); e.z += tdz;
      const down = this.sweep(e, 1, -up, boxes); e.y += down;
      const gained = tdx * tdx + tdz * tdz, before = adx * adx + adz * adz;
      if (gained > before + 1e-6 && down !== -up) { e.onGround = true; e.hitX = tdx !== dx; e.hitZ = tdz !== dz; }
      else { e.x = px; e.y = py; e.z = pz; }
    }
    if (e.sneaking && wasOnGround && !e.onGround) {
      const test = this.collectBoxes(e.x - e.w, e.y - 0.6, e.z - e.w, e.x + e.w, e.y, e.z + e.w);
      let ground = false;
      for (let i = 0; i < test.length; i += 6) if (test[i + 4] >= e.y - 0.6 && test[i] < e.x + e.w && test[i + 3] > e.x - e.w && test[i + 2] < e.z + e.w && test[i + 5] > e.z - e.w) { ground = true; break; }
      if (!ground) { e.x = sx; e.z = sz; e.onGround = true; }
    }
  }
}

// ---- 输入：键盘 + 指针锁定（宿主 B Input 的子集）
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = {}; this.dx = 0; this.dy = 0; this.locked = false; this.onkey = null;
    addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (!this.keys[e.code]) this.onkey?.(e.code, e);
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'F3', 'F4', 'AltLeft', 'AltRight'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    canvas.addEventListener('mousedown', () => { if (!this.locked) this.lock(); });
    document.addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) this.keys = {}; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  lock() { try { const r = this.canvas.requestPointerLock(); r?.catch?.(() => {}); } catch {} }
  take() { const r = [this.dx, this.dy]; this.dx = this.dy = 0; return r; }
}

// ---- 玩家
export function makePlayer() {
  return { x: 0, y: 140, z: 0, vx: 0, vy: 0, vz: 0, w: 0.3, h: 1.8, eyeHeight: 1.62, stepHeight: 0.6, yaw: 0, pitch: 0,
    onGround: false, hitX: false, hitZ: false, flying: false, sneaking: false, sprinting: false, noclip: false, inWater: false, headInWater: false,
    aj: 0, fallStart: 0, lastSpaceTap: 0, sprintLatch: false, lastWTap: 0, _nc: false };   // _nc：noclip 上一帧值（undefined 会让首帧调 unstuck，把 p1 的 y 顶出地面）
}

export class Controller {
  constructor(world, tbl, input, p = makePlayer()) { this.world = world; this.tbl = tbl; this.input = input; this.p = p; this.phys = new Physics(world, tbl); this.freeze = false; }
  forward() { const p = this.p; return [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)]; }
  lookDir() { const p = this.p, cp = Math.cos(p.pitch); return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp]; }
  toggleFly() { const p = this.p; p.flying = !p.flying; if (p.flying) { p.onGround = false; p.vy = 0; } }
  key(code) {   // Input.onkey：双击空格飞行，双击 W 疾跑锁
    const p = this.p, now = performance.now();
    if (code === 'Space') { if (now - p.lastSpaceTap < 300) { this.toggleFly(); p.lastSpaceTap = 0; } else p.lastSpaceTap = now; }
    else if (code === 'KeyW') { if (now - p.lastWTap < 300) p.sprintLatch = true; p.lastWTap = now; }
    else if (code === 'KeyV') p.noclip = !p.noclip;
  }
  fluidAt(x, y, z) { return this.tbl.fluid[this.world.getBlock(floor(x), floor(y), floor(z))]; }

  update(dt) {
    const p = this.p, I = this.input, k = I.keys, W = this.world;
    if (I.locked) { const [mx, my] = I.take(); p.yaw -= mx * c_Motion.sens; p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, p.pitch - my * c_Motion.sens)); } else I.take();
    if (this.freeze) return;
    const controls = I.locked;
    p.inWater = !!(this.fluidAt(p.x, p.y + 0.1, p.z) || this.fluidAt(p.x, p.y + 0.9, p.z)); p.headInWater = !!this.fluidAt(p.x, p.y + p.eyeHeight, p.z);
    let mx = 0, mz = 0, shiftHeld = false;
    if (controls) {
      if (k.KeyW) mz += 1; if (k.KeyS) mz -= 1; if (k.KeyA) mx -= 1; if (k.KeyD) mx += 1;
      const shift = shiftHeld = !!(k.ShiftLeft || k.ShiftRight), ctrl = k.ControlLeft || k.ControlRight, alt = k.AltLeft || k.AltRight;
      if (!k.KeyW) p.sprintLatch = false;
      p.sneaking = !!alt;
      p.sprinting = !!(shift || (p.flying && ctrl) || (p.sprintLatch && mz > 0)) && !p.sneaking;
    } else { p.sneaking = false; p.sprinting = false; }
    p.eyeHeight = p.sneaking && !p.flying ? 1.27 : 1.62;
    const len = Math.hypot(mx, mz); if (len > 0) { mx /= len; mz /= len; }
    const flyBoost = p.flying && shiftHeld, lookFly = p.flying && shiftHeld, f = lookFly ? this.lookDir() : this.forward(), r = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const wx = f[0] * mz + r[0] * mx, wz = f[2] * mz + r[2] * mx;
    let speed = 4.517;
    if (p.sprinting) speed = 5.812; if (p.sneaking) speed = 1.31;
    if (p.flying) speed = c_Motion.flySpeed * (p.sprinting || flyBoost ? 2 : 1);
    else if (p.inWater) speed = 2.2;
    const rate = p.flying ? 8 : (p.onGround || p.aj ? 18 : (p.inWater ? 6 : 3)), kk = 1 - Math.exp(-rate * dt);
    p.vx += (wx * speed - p.vx) * kk; p.vz += (wz * speed - p.vz) * kk;
    const jump = controls && !!k.Space; let vyAvg = null;
    if (p.flying) {
      const vy = (jump ? 1 : 0) - (p.sneaking ? 1 : 0), look = lookFly ? f[1] * mz * speed : 0;
      p.vy += (vy * (p.sprinting || flyBoost ? 16 : 8) + look - p.vy) * (1 - Math.exp(-10 * dt));
      if (p.onGround && vy < 0 && !lookFly) p.flying = false;
    } else if (p.inWater) {
      if (jump) p.vy = Math.min(p.vy + 30 * dt, 4); else p.vy = Math.max(p.vy - 10 * dt, -3);
      p.vy *= (1 - 2 * dt);
      if (p.onGround && jump) p.vy = 4;
    } else {
      if (jump && p.onGround) { p.vy = JUMP_VEL; p.onGround = false; }
      const v0 = p.vy; p.vy = Math.max(v0 - GRAVITY * (p.aj || 1) * dt, -TERMINAL); vyAvg = (v0 + p.vy) / 2;
    }
    p.stepHeight = 0.6;
    const prevOnGround = p.onGround;
    if (p.noclip !== p._nc) { p._nc = p.noclip; this.phys.unstuck(p); }
    if (p.noclip && p.flying) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.onGround = p.hitX = p.hitZ = false; }
    else this.phys.move(p, p.vx * dt, (vyAvg ?? p.vy) * dt, p.vz * dt);
    if (p.aj && (p.onGround || p.flying || p.inWater)) p.aj = 0;
    this.autoJump(wx, wz, prevOnGround);
    if (!p.aj) { if (p.hitX) p.vx = 0; if (p.hitZ) p.vz = 0; }
  }
  // MC 自动跳：撞上 1 格高的台阶且头上有空间 = 真跳一下
  autoJump(wx, wz, wasGround) {
    const p = this.p, P = this.phys;
    if (!(p.hitX || p.hitZ) || !(p.onGround || wasGround) || p.flying || p.sneaking || p.inWater || (!wx && !wz)) return;
    const r = c_Motion.autoJumpReach, probe = { x: p.x + wx * r, y: p.y, z: p.z + wz * r, w: p.w, h: p.h };
    if (!P.intersects(probe)) return;
    probe.y = floor(p.y + 0.01) + 1.001;
    if (probe.y - p.y > 1.05 || P.intersects(probe) || P.intersects({ x: p.x, y: probe.y, z: p.z, w: p.w, h: p.h })) return;
    const kf = p.sprinting ? c_Motion.autoJumpSprint : 1;
    p.vy = JUMP_VEL * kf; p.aj = kf * kf; p.onGround = false;
  }
}
