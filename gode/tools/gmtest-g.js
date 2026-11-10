// gm.test 的 gode 版（s12 §4 / A-5；M0-3 说「gode/index.html 起来后换成 gode 版」）：同名同参，gd / checks.tsv 两边都能跑。
// 由 gode/main/boot.js 在启动完成后 import 并 install(window.gode)。宿主 B 的那份是 gmtest-b.js。
// 与宿主 B 版的差别：没有 mob / 掉落物 / 游戏 tick（gode 的 M1 里还没有），freeze 只钉时钟与 rgl 的波 / 云相位并冻结控制器；find 机位搜索规则还没做（返回 null）。
import { parse, raster } from './xz.js';

const raf = () => new Promise(requestAnimationFrame);

export function install(g) {
  const { world, ctl, p, VR, clock, meta } = g, q = new URLSearchParams(location.search);
  const SEED = q.get('seed') ?? '20240607', GEN = q.get('g') ?? 'mini', EYE = 1.62;
  document.head.insertAdjacentHTML('beforeend', '<style>body.gd-nohud #f3, body.gd-nohud #cross { display: none }</style>');

  let F = null;   // freeze 状态
  const pin = () => { if (!F) return; clock.hour = F.hour; clock.speed = 0; Object.assign(p, { vx: 0, vy: 0, vz: 0 }); const D = VR.D; if (D) { D.time = F.wave; D.cloudX = F.cloud; } };
  const loop = () => { pin(); requestAnimationFrame(loop); }; loop();

  // mark / revert：mark 之后每格第一次被改时记下原值
  let rec = null;
  const set0 = world.set.bind(world);
  world.set = (x, y, z, v) => { if (rec) { const k = `${x},${y},${z}`; if (!rec.has(k)) rec.set(k, [x, y, z, world.get(x, y, z)]); } return set0(x, y, z, v); };

  const fnv = () => { let h = 0x811c9dc5; return { add(v) { h = Math.imul(h ^ (v & 0xffff), 0x01000193) >>> 0; }, get hex() { return h.toString(16).padStart(8, '0'); } }; };
  const lookAt = (from, to) => { const d = to.map((v, i) => v - from[i]); return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) }; };
  const ISO = { ne: [1, 1], se: [1, -1], sw: [-1, -1], nw: [-1, 1] };
  const typeOf = (name) => meta.names.indexOf(name);

  const T = {
    seed: SEED, gen: GEN, host: 'gode',
    ready: g.ready ?? null,
    freeze({ hour = 10, wave = 10, cloud = 0, hud = true } = {}) {
      F = { hour, wave, cloud }; ctl.freeze = true; pin();
      document.body.classList.toggle('gd-nohud', !hud);
      VR.resetLag?.();
      return F;
    },
    unfreeze() { F = null; ctl.freeze = false; document.body.classList.remove('gd-nohud'); },
    async settle({ ms = 20000 } = {}) { const t = await g.settle(ms); await raf(); await raf(); return { ms: Math.round(t) }; },
    pose(v) {
      if (typeof v === 'string') {
        const m = /^@(-?[\d.]+),(-?[\d.]+)\^(-?[\d.]+)(?:,(-?[\d.]+))?(?:,(-?[\d.]+))?(?:,([\d.]+))?$/.exec(v);
        if (m) v = { x: +m[1], z: +m[2], y: +m[3], yaw: +(m[4] ?? p.yaw), pitch: +(m[5] ?? p.pitch), ...(m[6] && { fov: +m[6] }) };
        else if (/^iso-(ne|se|sw|nw)$/.test(v)) return T.frame([p.x - 4, p.y - 2, p.z - 4, p.x + 4, p.y + 4, p.z + 4], v);
        else throw new Error('不认识的机位：' + v);
      }
      Object.assign(p, { x: v.x, y: v.y, z: v.z, yaw: v.yaw ?? p.yaw, pitch: v.pitch ?? p.pitch, vx: 0, vy: 0, vz: 0, noclip: true, flying: true });
      if (v.fov) { g.camera.fov = v.fov; g.camera.updateProjectionMatrix(); }
      VR.resetLag?.();
      return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fov: g.camera.fov };
    },
    frame(b, cam = 'iso-ne') {
      const [sx, sz] = ISO[cam.replace('iso-', '')] || ISO.ne;
      const c = [(b[0] + b[3] + 1) / 2, (b[1] + b[4] + 1) / 2, (b[2] + b[5] + 1) / 2];
      const r = Math.hypot(b[3] - b[0] + 1, b[4] - b[1] + 1, b[5] - b[2] + 1) / 2;
      const fov = g.camera.fov * Math.PI / 180, d = Math.max(6, r / Math.sin(fov / 2) * 1.1), el = 0.6;
      const eye = [c[0] + sx * d * Math.cos(el) / Math.SQRT2, c[1] + d * Math.sin(el), c[2] - sz * d * Math.cos(el) / Math.SQRT2];
      return T.pose({ x: eye[0], y: eye[1] - EYE, z: eye[2], ...lookAt(eye, c) });
    },
    xz(text, { at } = {}) {   // XZ1 → 放置（走 world.set）；方块名按生成器 meta.names 查 type
      const doc = parse(text), off = typeof at === 'string' ? (([x, z, y]) => [x, y, z])(at.slice(1).split(/[,^]/).map(Number)) : at || [0, 0, 0];
      const { cells, bbox } = raster(doc);
      let placed = 0, missing = 0; const unknown = new Set();
      for (const [k, blk] of cells) {
        const [x, y, z] = k.split(',').map((v, i) => +v + off[i]), t = typeOf(blk.name);
        if (t < 0) { unknown.add(blk.name); continue; }
        if (!world.loaded(x, z)) { missing++; continue; }
        world.set(x, y, z, t); placed++;
      }
      const bb = bbox && bbox.map((v, i) => v + off[i % 3]);
      return (window.LAST = { name: doc.name, bbox: bb, placed, missing, unknown: [...unknown], hash: bb && T.hash(bb) });
    },
    mark() { rec = new Map(); return 0; },
    revert() {
      if (!rec) return 0;
      const r = [...rec.values()]; rec = null;
      for (let i = r.length - 1; i >= 0; i--) set0(r[i][0], r[i][1], r[i][2], r[i][3]);
      return r.length;
    },
    hash(b) { const h = fnv(); for (let y = b[1]; y <= b[4]; y++) for (let z = b[2]; z <= b[5]; z++) for (let x = b[0]; x <= b[3]; x++) h.add(world.get(x, y, z)); return h.hex; },
    probe(x, y, z) { const v = world.get(x, y, z), l = world.lightAt(x, y, z); return { blk: meta.names[v & 0xfff], id: v & 0xfff, meta: v >> 12, sky: l >> 4, light: l & 15 }; },
    stats() { return { r: VR.stats(), chunks: world.chunks.size, pending: VR.pending(), ...g.stats() }; },
    errors() { const gl = g.renderer.getContext().getError(), r = g.errors(); return gl ? [...r, 'GL error 0x' + gl.toString(16)] : r; },
    set(path, v) {   // 'VR.P.x' / 'c_.Gl.x' → rgl P；'c_.Motion.x' → 控制器常量（c_ 表 M1-2 才有）
      const s = path.split('.');
      if ((s[0] === 'c_' && s[1] === 'Gl') || (s[0] === 'VR' && s[1] === 'P')) { const P = VR.P; P[s[2]] = v; VR.apply(s[2]); return P[s[2]]; }
      throw new Error('gode 的 c_ 表还没有（M1-2）：只支持 VR.P.<键> 与 c_.Gl.<键>');
    },
    find() { return null; },   // 机位搜索规则（plain canopy cave water uw）：宿主 B 版依赖方块名分类，gode 版等 s04 的方块表再做
  };
  // ── checks.tsv 用到的页面侧检查：都返回 { ok, msg } ──
  const colHash = () => {   // 出生块周围内圈 5×5 区块（不含最外一圈：跨块装饰依赖加载顺序）
    const h = fnv(), [sx, sz] = g.spawnC;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const c = world.chunk(sx + dx, sz + dz); if (!c) return null; for (let i = 0; i < c.blocks.length; i++) h.add(c.blocks[i]); }
    return h.hex;
  };
  T.checks = {
    async genhash() {   // 同种子热重置一次（区块到达顺序是新的），内圈 5×5 方块哈希应相等（M1-3）
      const keep = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
      T.pose({ x: g.spawnC[0] * 16 + 8.5, y: 100, z: g.spawnC[1] * 16 + 8.5 }); await T.settle();
      const a = colHash(); await g.restart(); await T.settle(); const b = colHash();
      T.pose(keep); await T.settle();
      return { ok: !!a && a === b, msg: `${a} / ${b}` };
    },
    async phys() {   // 落地 → 跳（顶点 ≈ v²/2g）→ 走（≈ 4.5 格 / s）→ 双击空格飞行
      if (meta.id === 'veg') return { skip: true, msg: 'veg：出生点常落在树冠下，+6 格的落地 / 起跳随机不稳（11-10 定，跳过）' };
      const I = ctl.input, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), keep = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying, noclip: p.noclip };
      const was = F; T.unfreeze(); await T.settle(); Object.assign(p, { flying: false, noclip: false, vx: 0, vy: 0, vz: 0, yaw: 0, y: p.y + 6 }); I.keys = {}; I.locked = true;
      const out = {}; try {
        await sleep(1500); out.ground = p.onGround;
        const y0 = p.y; let top = y0; I.keys.Space = true; const t0 = performance.now();
        while (performance.now() - t0 < 900) { top = Math.max(top, p.y); await sleep(8); if (performance.now() - t0 > 80) I.keys.Space = false; }
        I.keys.Space = false; out.rise = top - y0; await sleep(400);
        const z0 = p.z, x0 = p.x; I.keys.KeyW = true; await sleep(1000); I.keys.KeyW = false; out.walk = Math.hypot(p.z - z0, p.x - x0);
        ctl.key('Space'); ctl.key('Space'); out.fly = p.flying;
      } finally { I.locked = false; I.keys = {}; Object.assign(p, keep, { vx: 0, vy: 0, vz: 0 }); if (was) T.freeze({ hour: was.hour, wave: was.wave, cloud: was.cloud }); }
      const ok = out.ground && Math.abs(out.rise - 1.103) < 0.1 && out.walk > 3.5 && out.walk < 5 && out.fly;
      return { ok: !!ok, msg: `ground ${out.ground} rise ${out.rise?.toFixed(2)} walk ${out.walk?.toFixed(2)} fly ${out.fly}` };
    },
  };
  window.gm = { ...(window.gm ?? {}), test: T };
  return T;
}
