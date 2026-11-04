// rgl/waterfall.js —— 瀑布粒子：从下落水柱（水方块 meta ≥ 8）里往宿主 Particles 发射水滴，落到水面时和雨滴一样触发 Particles.splash。
//   多数沿水柱下落，少数朝有空气的侧面飞出；轨迹在发射时按宿主粒子的重力 / 碰撞规则预测一遍：落点 = 水面（或实心方块）→ 粒子寿命正好到那一刻，
//   水面落点另排一个溅起事件（宿主粒子不认水面，会穿过去）。发射点每 0.5 s 在玩家附近扫一遍；密度 = vr.P.fallDrops（0 = 关）。
const R = 20, DY0 = -12, DY1 = 16, MAXC = 96, RATE = 4, G = 18, DT = 1 / 60;   // G = 宿主 c_Particles.gravity
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function install(gg, vr) {
  const { world, B, Particles: Pt, player } = gg, floor = Math.floor, rnd = Math.random;
  let cells = [], scan = 0, splashes = [];
  const surfY = (x, y, z) => { const id = world.getBlock(x, y, z); if (id !== B.water) return -1; const m = world.getMeta(x, y, z); return m >= 8 ? -1 : y + (m === 0 ? 8 : 8 - m) / 9; };
  function rescan() {
    const px = floor(player.x), py = floor(player.y), pz = floor(player.z), out = [];
    for (let x = px - R; x <= px + R; x++) for (let z = pz - R; z <= pz + R; z++)
      for (let y = py + DY0; y <= py + DY1; y++)
        if (world.getBlock(x, y, z) === B.water && world.getMeta(x, y, z) >= 8) out.push({ x, y, z, d: (x - player.x) ** 2 + (z - player.z) ** 2 + (y - player.y) ** 2 });
    out.sort((a, b) => a.d - b.d); cells = out.slice(0, MAXC);
  }
  function emit(c) {
    let x = c.x + rnd(), y = c.y + rnd(), z = c.z + rnd(), vx = (rnd() - 0.5) * 0.3, vz = (rnd() - 0.5) * 0.3, vy = -(1 + rnd() * 2);
    if (rnd() < 0.15) {                                                      // 少数往外飞：只挑露在空气里的那一面
      const open = SIDES.filter(([dx, dz]) => world.getBlock(c.x + dx, c.y, c.z + dz) === 0);
      if (open.length) { const [dx, dz] = open[floor(rnd() * open.length)], v = 1.5 + rnd() * 1.5; vx = dx * v + (rnd() - 0.5) * 0.6; vz = dz * v + (rnd() - 0.5) * 0.6; vy = rnd() * 1.2; }
    }
    let t = 0, sx = 0, sy = 0, sz = 0, hit = 0, px = x, py = y, pz = z, qx = vx, qy = vy, qz = vz;
    for (; t < 2.5; t += DT) {                                               // 预测：与宿主 Particles.update 相同的积分 / 碰撞
      qy -= G * DT; const nx = px + qx * DT, ny = py + qy * DT, nz = pz + qz * DT, bx = floor(nx), by = floor(ny), bz = floor(nz);
      const s = surfY(bx, by, bz);
      if (s >= 0 && ny < s) { hit = 2; sx = nx; sy = s; sz = nz; break; }
      if (world.isSolid(bx, by, bz)) { hit = 1; break; }
      px = nx; py = ny; pz = nz;
    }
    Pt.spawn(x, y, z, vx, vy, vz, hit ? t + (hit === 1 ? 0.15 : 0) : 2.5, 0.55, 0.75, 1.0);
    if (hit === 2) splashes.push({ t, x: sx, y: sy, z: sz });
  }
  gg.waterfall = dt => {
    const dens = vr.P.fallDrops || 0;
    if (dens <= 0) { cells = []; splashes.length = 0; return; }
    if ((scan -= dt) <= 0) { scan = 0.5; rescan(); }
    const e = RATE * dens * dt;
    if (Pt.n < 3200) for (const c of cells) { for (let k = e; k > 0; k--) if (k >= 1 || rnd() < k) emit(c); }
    for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; if ((s.t -= dt) <= 0) { if (Pt.n < 3600) Pt.splash(s.x, s.y + 0.1, s.z, 1); splashes.splice(i, 1); } }
  };
  return () => { delete gg.waterfall; };
}
