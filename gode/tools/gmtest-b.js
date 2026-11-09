// gm.test 垫片（宿主 B，s12 §4 / A-5）：index.html 带 &test=1 时 import 并 install(gg, gm)。
// gode/index.html 起来后换成 gode 版；同名同参，gd / checks.tsv 两边都能跑。
// URL：&seed=（默认 20240607）&rd=（默认 6）——宿主 B 本身不读这两个参数，由这里开一次性世界（不读档）。
import { parse, raster } from './xz.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = () => new Promise(r => requestAnimationFrame(r));

export function install(gg, gm) {
  const q = new URLSearchParams(location.search);
  const { Game, world, player, ChunkManager, Sky, Weather, Mobs, Entities, B, Blocks, DAY_LENGTH, CHUNK_H } = gg;
  const SEED = q.get('seed') || '20240607', RD = +(q.get('rd') || 6), EYE = 1.62;
  const VR = () => gg.VR;

  // ── 错误收集（errors() 取自上次调用以来的） ──
  let errs = [];
  const ce = console.error.bind(console);
  console.error = (...a) => { errs.push(a.map(v => v?.stack || String(v)).join(' ')); ce(...a); };
  addEventListener('error', e => errs.push('EXCEPTION: ' + (e.error?.stack || e.message)));
  addEventListener('unhandledrejection', e => errs.push('REJECTION: ' + (e.reason?.stack || e.reason)));

  // ── 冻结：每帧把时间 / 水波 / 云 / 天气钉回去，mob 与掉落物清场 ──
  let F = null;
  const hourT = h => ((h * 1000 - 6000) % DAY_LENGTH + DAY_LENGTH) % DAY_LENGTH;   // gm.time.set 的同一公式
  const pin = () => {
    if (!F) return;
    Sky.time = F.t; Weather.raining = Weather.thunder = false; Weather.amount = Weather.storm = 0;
    const v = VR(); if (v) { v.D.time = F.wave; v.D.cloudX = F.cloud; }
    Object.assign(player, { vx: 0, vy: 0, vz: 0, noclip: true, flying: true });
  };
  const wrap = (o, k, before) => { const f = o[k]; o[k] = function (...a) { if (before() === false) return; return f.apply(this, a); }; };
  wrap(Sky, 'update', () => { pin(); });
  wrap(Game, 'tick', () => F && !F.tick ? false : undefined);   // 随机 tick / 流体 / 火：冻结时世界不随时间变（genhash 依赖）
  wrap(Mobs, 'update', () => { if (F && !F.mobs) { if (Mobs.list.length) Mobs.clear(); return false; } });
  wrap(Entities, 'update', () => { if (F && !F.mobs) { if (Entities.list.length) Entities.clear(); return false; } });

  // ── mark / revert：mark 之后每格第一次被改时记下原值 ──
  let rec = null;
  const setBlock0 = world.setBlock;
  world.setBlock = function (x, y, z, id, meta = 0, flags = 0) {
    if (rec) { const k = `${x},${y},${z}`; if (!rec.has(k)) rec.set(k, [x, y, z, this.getBlock(x, y, z), this.getMeta(x, y, z)]); }
    return setBlock0.call(this, x, y, z, id, meta, flags);
  };

  const fnv = () => { let h = 0x811c9dc5; return { add(v) { h = Math.imul(h ^ (v & 0xffff), 0x01000193) >>> 0; }, get hex() { return h.toString(16).padStart(8, '0'); } }; };
  const surf = (x, z) => { let y = CHUNK_H - 2; while (y > 0 && (world.getBlock(x, y, z) === 0 || world.getBlock(x, y, z) === B.short_grass)) y--; return y; };
  const lookAt = (from, to) => { const d = to.map((v, i) => v - from[i]); return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])) }; };
  const ISO = { ne: [1, 1], se: [1, -1], sw: [-1, -1], nw: [-1, 1] };   // 相机在目标的哪个方向（+x 东，−z 北）

  const T = {
    seed: SEED, gen: 'mini', host: 'b',
    ready: null,
    // { hour, wave, cloud, mobs, hud, tick }：tick=false 停游戏 tick（默认）；hud=false 隐藏 HUD 叠层（截图更干净）
    freeze({ hour = 10, wave = 10, cloud = 0, mobs = false, hud = true, tick = false } = {}) {
      F = { t: hourT(hour), wave, cloud, mobs, tick }; pin();
      if (!mobs) { Mobs.clear(); Entities.clear(); }
      document.body.classList.toggle('gd-nohud', !hud);
      VR()?.resetLag?.();
      return F;
    },
    unfreeze() { F = null; document.body.classList.remove('gd-nohud'); },
    // 区块 pending 0、网格队列空；连续 3 帧满足才算（freeze 后 D.time 非空，rgl 的升起 / 淡入动画自动关）
    async settle({ ms = 15000 } = {}) {
      const t0 = performance.now(); let ok = 0;
      while (ok < 3) {
        if (performance.now() - t0 > ms) throw new Error(`settle 超时 ${ms}ms：ready ${Game.ready} 进度 ${ChunkManager.progress().toFixed(2)} 网格 pending ${VR()?.pending?.() ?? '-'}`);
        ChunkManager.update(player.x, player.z, 30);
        await raf();
        ok = Game.ready && !Game.hold && ChunkManager.progress() >= 1 && !(VR()?.pending?.() > 0) ? ok + 1 : 0;
      }
      await raf(); await raf();
      return { ms: Math.round(performance.now() - t0) };
    },
    // 名字由 gd 先查 c_.Bench.poses 换成对象；这里收 {x,y,z,yaw,pitch,fov} | '@x,z^y,yaw,pitch[,fov]' | 'iso-ne' 等（以玩家脚下为目标）
    pose(p) {
      if (typeof p === 'string') {
        const m = /^@(-?[\d.]+),(-?[\d.]+)\^(-?[\d.]+)(?:,(-?[\d.]+))?(?:,(-?[\d.]+))?(?:,([\d.]+))?$/.exec(p);
        if (m) p = { x: +m[1], z: +m[2], y: +m[3], yaw: +(m[4] ?? player.yaw), pitch: +(m[5] ?? player.pitch), ...(m[6] && { fov: +m[6] }) };
        else if (/^iso-(ne|se|sw|nw)$/.test(p)) return T.frame([player.x - 4, player.y - 2, player.z - 4, player.x + 4, player.y + 4, player.z + 4], p);
        else throw new Error('不认识的机位：' + p);
      }
      Object.assign(player, { x: p.x, y: p.y, z: p.z, yaw: p.yaw ?? player.yaw, pitch: p.pitch ?? player.pitch, vx: 0, vy: 0, vz: 0, noclip: true, flying: true });
      if (p.fov) { Game.fovBase = p.fov; gg.Player.fovTarget = p.fov; }
      Game.fov = Game.fovBase; Game.camera.fov = Game.fov; Game.camera.updateProjectionMatrix();   // 跳过 FOV 缓动（水下 / 冲刺的缓动取决于帧间隔）
      VR()?.resetLag?.();
      return { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, fov: Game.fovBase };
    },
    // 宿主 B 没有 F4 正交相机：用透视相机从 iso 方向斜 35° 框住 bbox
    frame(b, cam = 'iso-ne') {
      const [sx, sz] = ISO[cam.replace('iso-', '')] || ISO.ne;
      const c = [(b[0] + b[3] + 1) / 2, (b[1] + b[4] + 1) / 2, (b[2] + b[5] + 1) / 2];
      const r = Math.hypot(b[3] - b[0] + 1, b[4] - b[1] + 1, b[5] - b[2] + 1) / 2;
      const fov = Game.fovBase * Math.PI / 180, d = Math.max(6, r / Math.sin(fov / 2) * 1.1), el = 0.6;
      const eye = [c[0] + sx * d * Math.cos(el) / Math.SQRT2, c[1] + d * Math.sin(el), c[2] - sz * d * Math.cos(el) / Math.SQRT2];
      return T.pose({ x: eye[0], y: eye[1] - EYE, z: eye[2], ...lookAt(eye, c) });
    },
    // XZ1 → 放置（走 world.setBlock，光照 / 网格一起更新）；at = '@x,z^y' 或 [x,y,z]，加在文本零点上
    xz(text, { at } = {}) {
      const doc = parse(text), off = typeof at === 'string' ? (([x, z, y]) => [x, y, z])(at.slice(1).split(/[,^]/).map(Number)) : at || [0, 0, 0];
      const { cells, bbox } = raster(doc);
      let placed = 0, missing = 0; const unknown = new Set();
      for (const [k, blk] of cells) {
        const [x, y, z] = k.split(',').map((v, i) => +v + off[i]), id = B[blk.name];
        if (id == null) { unknown.add(blk.name); continue; }
        if (!world.isLoaded(x, z)) { missing++; continue; }
        world.setBlock(x, y, z, id, 0); placed++;
      }
      const bb = bbox && bbox.map((v, i) => v + off[i % 3]);
      return (window.LAST = { name: doc.name, bbox: bb, placed, missing, unknown: [...unknown], hash: bb && T.hash(bb) });
    },
    mark() { rec = new Map(); return 0; },
    revert() {
      if (!rec) return 0;
      const r = [...rec.values()]; rec = null;
      for (let i = r.length - 1; i >= 0; i--) setBlock0.call(world, r[i][0], r[i][1], r[i][2], r[i][3], r[i][4]);
      return r.length;
    },
    hash(b) {
      const h = fnv();
      for (let y = b[1]; y <= b[4]; y++) for (let z = b[2]; z <= b[5]; z++) for (let x = b[0]; x <= b[3]; x++) { h.add(world.getBlock(x, y, z)); h.add(world.getMeta(x, y, z)); }
      return h.hex;
    },
    probe(x, y, z) {
      const id = world.getBlock(x, y, z);
      return { blk: Blocks.byId[id]?.name, id, meta: world.getMeta(x, y, z), sky: world.getSky(x, y, z), light: world.getBlockLight(x, y, z) };
    },
    stats() {
      const v = VR();
      return { r: v?.stats?.() ?? 'three', chunks: world.chunks.size, ...ChunkManager.stats, pending: v?.pending?.() ?? 0, fps: Math.round(1000 / (Game.frameMs || 16)) };
    },
    errors() {
      const gl = Game.renderer.getContext().getError();
      const r = errs; errs = [];
      return gl ? [...r, 'GL error 0x' + gl.toString(16)] : r;
    },
    // 'c_.Motion.flySpeed' → gg.c_Motion.flySpeed；'c_.Gl.x' / 'VR.P.x' → rgl P（走 apply 副作用）
    set(path, v) {
      const s = path.split('.');
      if ((s[0] === 'c_' && s[1] === 'Gl') || (s[0] === 'VR' && s[1] === 'P')) { const P = VR().P; P[s[2]] = v; VR().apply(s[2]); return P[s[2]]; }
      let o = s[0] === 'c_' ? gg['c_' + s[1]] : window[s[0]]?.[s[1]];
      if (!o) throw new Error('没有 ' + s.slice(0, 2).join('.'));
      for (const k of s.slice(2, -1)) o = o[k];
      return (o[s.at(-1)] = v);
    },
    // 机位搜索（handover/tools.md §3 的规则，在已加载区块里，同种子结果确定）
    find(rule) {
      const X0 = Math.floor(player.x), Z0 = Math.floor(player.z), R = RD * 16 - 24, gb = (x, y, z) => world.getBlock(x, y, z), SEA = gg.SEA_LEVEL;
      let best = null, bs = -Infinity;
      const scan = (step, fn) => { for (let x = X0 - R; x <= X0 + R; x += step) for (let z = Z0 - R; z <= Z0 + R; z += step) if (world.isLoaded(x, z)) { const s = fn(x, z); if (s != null && s > bs) { bs = s; best = [x, z]; } } };
      if (rule === 'plain') {   // ±6 起伏最小、非水非叶的地表，平视远眺
        scan(4, (x, z) => { const h = surf(x, z); if (h <= SEA + 1 || gb(x, h, z) === B.water || gg.isLeaves(gb(x, h, z))) return null; let v = 0; for (let d = -6; d <= 6; d += 3) v += Math.abs(surf(x + d, z) - h) + Math.abs(surf(x, z + d) - h); return -v; });
        return best && { x: best[0] + 0.5, y: surf(...best) + 1, z: best[1] + 0.5, yaw: 0.6, pitch: -0.04 };
      }
      if (rule === 'canopy') {  // 周围树叶最密的树干旁，仰视掠射树冠
        scan(2, (x, z) => { let y = surf(x, z); if (!gg.isLeaves(gb(x, y, z))) return null; while (y > 0 && gg.isLeaves(gb(x, y, z))) y--; if (!gg.isLog(gb(x, y, z))) return null; let n = 0; for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) if (gg.isLeaves(gb(x + dx, surf(x + dx, z + dz), z + dz))) n++; return n; });
        if (!best) return null;
        let y = surf(...best); while (y > 0 && !gg.isLog(gb(best[0], y, best[1]))) y--; while (y > 0 && gg.isLog(gb(best[0], y, best[1]))) y--;
        return { x: best[0] + 1.5, y: y + 1, z: best[1] + 0.5, yaw: 0.6, pitch: 0.45 };
      }
      if (rule === 'water' || rule === 'uw') {   // 离岸最远（周边水最多）且水深 ≥ 5 的水柱
        scan(4, (x, z) => { const h = surf(x, z); if (gb(x, h, z) !== B.water) return null; let d = 0; while (d < 8 && gb(x, h - d - 1, z) === B.water) d++; if (d < 4) return null; let n = 0; for (let dx = -12; dx <= 12; dx += 4) for (let dz = -12; dz <= 12; dz += 4) if (gb(x + dx, SEA, z + dz) === B.water) n++; return n; });
        if (!best) return null;
        const top = surf(...best); let d = 0; while (d < 8 && gb(best[0], top - d - 1, best[1]) === B.water) d++;
        return rule === 'water' ? { x: best[0] + 0.5, y: SEA + 3 - EYE, z: best[1] + 0.5, yaw: 0.6, pitch: -0.18 }
          : { x: best[0] + 0.5, y: top - Math.min(d, 4) + 0.2 - EYE, z: best[1] + 0.5, yaw: 0.6, pitch: 1.05 };
      }
      if (rule === 'cave') {    // 地下 9×5×9 空气最多的格
        let bp = null, bn = 0;
        for (let x = X0 - R; x <= X0 + R; x += 4) for (let z = Z0 - R; z <= Z0 + R; z += 4) { if (!world.isLoaded(x, z)) continue; const h = surf(x, z) - 8;
          for (let y = 8; y < h; y += 3) { if (gb(x, y, z) !== 0 || gb(x, y + 1, z) !== 0) continue; let n = 0; for (let dx = -4; dx <= 4; dx += 2) for (let dz = -4; dz <= 4; dz += 2) for (let dy = -1; dy <= 3; dy++) if (gb(x + dx, y + dy, z + dz) === 0) n++; if (n > bn) { bn = n; bp = [x, y, z]; } } }
        if (!bp) return null;
        let by = 0, bl = -1;
        for (let a = 0; a < 8; a++) { const yaw = a * Math.PI / 4, d = [-Math.sin(yaw), -Math.cos(yaw)]; let l = 1; while (l < 32 && gb(Math.floor(bp[0] + d[0] * l), bp[1] + 1, Math.floor(bp[2] + d[1] * l)) === 0) l++; if (l > bl) { bl = l; by = yaw; } }
        return { x: bp[0] + 0.5, y: bp[1], z: bp[2] + 0.5, yaw: by, pitch: -0.05 };
      }
      throw new Error('没有搜索规则：' + rule);
    },
  };

  // ── checks.tsv 用到的页面侧检查：都返回 { ok, msg } ──
  const colHash = () => {   // 出生块周围内圈 5×5 区块（不含最外一圈：跨块装饰依赖加载顺序）
    const h = fnv();
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const c = world.getChunk(T.spawnC[0] + dx, T.spawnC[1] + dz);
      if (!c) return null;
      for (let i = 0; i < c.blocks.length; i++) { h.add(c.blocks[i]); h.add(c.meta[i]); }
    }
    return h.hex;
  };
  T.checks = {
    async errors() { await T.settle(); const e = T.errors(); return { ok: !e.length, msg: e.length ? e.slice(0, 5).join(' | ') : '无报错' }; },
    async genhash() {   // 同种子重开一次世界（同出生点、同加载顺序），内圈 5×5 哈希应相等
      const p = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch }, a = colHash();
      Game.start(SEED, null, false); await T.settle(); T.freeze(F ? { hour: (F.t / 1000 + 6) % 24, wave: F.wave, cloud: F.cloud } : {});
      const b = colHash(); T.pose(p); await T.settle();
      return { ok: !!a && a === b, msg: `${a} / ${b}` };
    },
    async seam() {   // 区块边界上挖 3 格长的地下通道，火把放在边界西侧：光照跨边界逐格减 1
      const x0 = (Math.floor(player.x) >> 4 << 4) + 16, z = Math.floor(player.z), y = Math.max(6, surf(x0, z) - 8);
      T.mark();
      try {
        for (let x = x0 - 3; x <= x0 + 2; x++) for (let dy = 0; dy < 2; dy++) world.setBlock(x, y + dy, z, 0, 0);
        world.setBlock(x0 - 3, y, z, B.torch, 0);
        for (let i = 0; i < 6; i++) await raf();
        const L = [-3, -2, -1, 0, 1, 2].map(d => world.getBlockLight(x0 + d, y, z));
        const ok = L.every((v, i) => i === 0 || L[i - 1] - v === 1);
        return { ok, msg: `x ${x0 - 3}…${x0 + 2} y ${y} z ${z} 方块光 ${L.join(' ')}` };
      } finally { T.revert(); }
    },
    async xzRoundtrip(files = {}) {   // M0 版：放置后逐格比对文本光栅；放两次哈希相等（识别器 read 到 M4-2 再做真往返）
      const out = [], at = [Math.floor(player.x) - 4, 100, Math.floor(player.z) - 4];
      let ok = true;
      for (const [name, text] of Object.entries(files)) {
        const { cells } = raster(parse(text));
        T.mark(); const a = T.xz(text, { at });
        let bad = 0; for (const [k, blk] of cells) { const [x, y, z] = k.split(',').map((v, i) => +v + at[i]); if (world.getBlock(x, y, z) !== B[blk.name]) bad++; }
        T.revert(); T.mark(); const b = T.xz(text, { at }); T.revert();
        const good = !bad && !a.missing && !a.unknown.length && a.hash === b.hash;
        ok &&= good; out.push(`${name}:${good ? 'ok' : `差 ${bad} 缺 ${a.missing} 未知 ${a.unknown}`}`);
      }
      return { ok: ok && out.length > 0, msg: out.join(' ') || '没有 .xz 样例' };
    },
    async rSwitch() {   // gl → 宿主 three（创造G 模式会切走 goodGL）→ gl
      if (!VR()) return { ok: false, msg: '没有 ?r=gl 渲染器' };
      const mode = Game.mode; T.errors();
      Game.setMode('creative+water'); for (let i = 0; i < 4; i++) await raf();
      const off = !Game.glOn;
      Game.setMode(mode); await T.settle();
      const e = T.errors(), on = Game.glOn;
      return { ok: off && on && !e.length, msg: `切走 ${off} 切回 ${on} ${VR().stats()} ${e.slice(0, 2).join(' | ')}` };
    },
  };

  // ── 开局：等 rgl（?r=gl 默认）→ 一次性世界 → settle → 冻结 ──
  T.ready = (async () => {
    const wantGl = (q.get('r') ?? 'gl') === 'gl';
    for (let i = 0; i < 100 && wantGl && !VR(); i++) await sleep(100);
    ChunkManager.setRenderDistance(RD);
    Game.start(SEED, null, false);
    T.spawnC = [Math.floor(player.x) >> 4, Math.floor(player.z) >> 4];
    T.freeze(); await T.settle({ ms: 30000 });
    return { seed: SEED, rd: RD, spawn: [player.x, player.y, player.z].map(Math.round), r: VR()?.name ?? 'three' };
  })();
  const st = document.createElement('style');
  st.textContent = 'body.gd-nohud #hud { display: none !important; }';
  document.head.append(st);
  gm.test = T;
  return T;
}
