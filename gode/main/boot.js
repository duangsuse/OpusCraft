/* gode/main/boot.js —— gode 宿主（M1）：起 slicer 池 → 世界镜像 → 控制器 → rgl，主循环。
   URL：?g=mini|gp|liq|old|pg1|luan0|luanV|<worker url>（默认 mini）&seed=（默认 20240607）&rd=（默认 6）&kw=a.b:1,c:2（生成器参数，s02 §2.1）
        &hour=（0..24，默认 10）&tspeed=（时钟快进：游戏小时 / 秒，默认 0 = 钉住）&p1=@x,z[^y][,yaw]（pgviz ↗；与 index.html 同格式，不给 = 出生点；pitch = −20°）&fly=1&noclip=1&r=gl
        &pv=[-]X|Y|Z[:切片]（与 pgviz 同写法：观察者在 +轴侧，切掉越过切片的一侧；0 键 = 切片向视线方向推 16 格；-Y = 仰视切掉切片以下）；每秒经 BroadcastChannel 'gode-sync' 把 p1（= hit，玩家点位）广播给 pgviz 标签页（URL 不动），也收 viz 的
   Agent / 调试：window.gode = { world, ctl, pool, VR, tbl, meta, clock, pose(), settle(), stats(), errors() } */
import * as THREE from '../../vendor/npm/three.module.js';
import { Pool } from '../w/pool.js';
import { glTable } from '../w/glid.js';
import { parseKw } from '../w/params.js';
import { World } from './world.js';
import { Input, Controller, makePlayer } from './phys.js';
import { createGl } from './rgl.js';

const q = new URLSearchParams(location.search);
const G = q.get('g') ?? 'mini', SEED = q.get('seed') ?? '20240607', RD = Math.min(16, +(q.get('rd') ?? 6) || 6);
const genUrl = (g) => /^(mini|gp|liq|old|pg1|luan0|luanV|veg)$/.test(g) ? new URL(`../defl/g/${g}.js`, import.meta.url).href : new URL(g, location.href).href;
const $ = (id) => document.getElementById(id);

// ---- 错误收集（errors() 取自上次调用以来的）：页面日志之外给 Agent 一个结构化入口
let errs = [];
const ce = console.error.bind(console);
console.error = (...a) => { errs.push(a.map(v => v?.stack || String(v)).join(' ')); ce(...a); };
addEventListener('error', (e) => errs.push('EXCEPTION: ' + (e.error?.stack || e.message)));
addEventListener('unhandledrejection', (e) => errs.push('REJECTION: ' + (e.reason?.stack || e.reason)));

const status = (s) => { const el = $('boot'); if (el) { el.textContent = s; el.style.display = s ? '' : 'none'; } };

async function main() {
  status(`起池 ${G} …`);
  const pool = new Pool(genUrl(G));
  pool.onerr = (e) => console.error('[slicer]', e.msg, e.stack);
  const meta = await pool.init({ seed: SEED, g: G, kw: parseKw(q.get('kw')) });
  const tbl = glTable(meta.names);
  const world = new World(pool, meta, tbl);

  // 渲染 / 相机（three 只负责上下文、实体与 HUD 叠层；画面是 rgl 的）
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';
  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  resize(); addEventListener('resize', resize);

  // 时钟：c.hour 0..24；tspeed 小时 / 秒
  const clock = { hour: +(q.get('hour') ?? 10), speed: +(q.get('tspeed') ?? 0), weather: { rain: 0, thunder: 0, wet: 0 }, day() { return (((this.hour - 6) / 24) % 1 + 1) % 1; } };

  const input = new Input(canvas), p = makePlayer(), ctl = new Controller(world, tbl, input, p);
  let rd = RD, dbg = true;
  // pv 截面：观察者在 dir 侧（+ = 轴正向），切掉越过切片 s 的那一侧；rgl 的 padded() 把它们当空气（main/rgl.js）
  const mp = /^\s*([+-]?)([XYZxyz])(?::\s*(-?\d+))?\s*$/.exec(q.get('pv') || '');
  const clip = { on: !!(mp && mp[3] !== undefined), a: mp ? 'XYZ'.indexOf(mp[2].toUpperCase()) : 1, dir: mp && mp[1] === '-' ? -1 : 1, s: mp && mp[3] !== undefined ? +mp[3] : 0, ver: 1 };
  let hasPv = !!mp; const axPos = () => [p.x, p.y + p.eyeHeight, p.z][clip.a];
  function setPv(str) {   // viz 来的 pv 字符串，同 URL 写法；变了才重出网格
    const m = /^\s*([+-]?)([XYZxyz])(?::\s*(-?\d+))?\s*$/.exec(str || ''); if (!m) return;
    const n = { on: m[3] !== undefined, a: 'XYZ'.indexOf(m[2].toUpperCase()), dir: m[1] === '-' ? -1 : 1, s: m[3] !== undefined ? +m[3] : clip.s };
    hasPv = true; if (n.on === clip.on && n.a === clip.a && n.dir === clip.dir && n.s === clip.s) return;
    Object.assign(clip, n); clip.ver++;
    for (const c of [...world.chunks.values()]) world.emit(c.cx, c.cz, 'blocks');
  }
  // 找站得下的地方（脚 + 头两格都不是固体）：先沿朝向反方向退（≤ 12 格，侧视时贴着 hit 的墙面站），再不行就往上找；p1 / viz 传送的点常在实心方块里
  const solidAt = (x, y, z) => y >= 0 && y < 256 && tbl.solid[world.getBlock(x, y, z)];
  const roomAt = (x, y, z) => !solidAt(x, y, z) && !solidAt(x, y + 1, z);
  function freeSpot(x, y, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), by = Math.floor(y);
    for (let k = 0; k <= 12; k++) { const bx = Math.floor(x - fx * k), bz = Math.floor(z - fz * k); for (const dy of [0, 1, -1]) if (roomAt(bx, by + dy, bz)) return [bx + 0.5, k === 0 && dy === 0 ? y : by + dy, bz + 0.5]; }
    const bx = Math.floor(x), bz = Math.floor(z); let yy = by; while (yy < 255 && !roomAt(bx, yy, bz)) yy++;
    return [bx + 0.5, yy, bz + 0.5];
  }
  function pushClip(n = 16) {   // 0 键：切片往视线方向（远离观察者）推 n 格；未指定切片时从玩家眼前这一格起
    if (!hasPv) return;
    if (!clip.on) { clip.on = true; clip.s = Math.floor(axPos()); }
    clip.s -= clip.dir * n; clip.ver++;
    for (const c of [...world.chunks.values()]) world.emit(c.cx, c.cz, 'blocks');
    toastMsg(`截面 ${clip.dir < 0 ? '-' : ''}${'XYZ'[clip.a]}:${clip.s}`);
  }
  let toastT = 0; const toastMsg = (t) => { status(t); clearTimeout(toastT); toastT = setTimeout(() => status(''), 1500); };
  // C 键 = pgviz 的 C：把玩家脚下（= p1 点位）的 x,z 加进原点列表（localStorage pgviz.origins，与 viz 同源同格式 `名:x,z[,y];…`，同坐标不重复）
  // 站在地表以下（洞 / 矿道 / 竖井）时把脚底 y 也记下（`x,z,y`），跳回去才落在同一层；地表原点不记 y（跳回去按当时的列高）
  function addOrigin() {
    const x = Math.floor(p.x), z = Math.floor(p.z), feet = Math.floor(p.y);
    const ch = world.chunk(x >> 4, z >> 4), top = ch ? ch.heights[((z & 15) << 4) | (x & 15)] : null;
    const y = top != null && feet < top ? feet : null, at = `@${x},${z}${y == null ? '' : '^' + y}`;
    let raw = ''; try { raw = localStorage.getItem('pgviz.origins') || ''; } catch {}
    const pt = (t) => { const q = t.slice(t.lastIndexOf(':') + 1).split(',').map(Number); return { x: q[0], z: q[1], y: q.length > 2 && Number.isFinite(q[2]) ? q[2] : null }; };
    const list = raw.split(';').filter((t) => t.includes(':'));
    const dup = list.find((t) => { const q = pt(t); return q.x === x && q.z === z && q.y === y; });
    if (dup) { toastMsg(`已有原点 ${dup.split(':')[0]} ${at}`); return; }
    let i = 1; while (list.some((t) => t.startsWith('C' + i + ':'))) i++;
    list.push(`C${i}:${x},${z}${y == null ? '' : ',' + y}`); try { localStorage.setItem('pgviz.origins', list.join(';')); } catch {}
    toastMsg(`已添加原点 C${i} ${at}`); bc.postMessage({ from: 'game', origins: true });   // 通知 viz 重读 localStorage
  }
  // 准星射线（DDA，≤ 64 格）：第一个固体方块 [x,y,z]
  function hitTest(max = 64) {
    const cy = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cy, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cy;
    const ox = p.x, oy = p.y + p.eyeHeight, oz = p.z;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const td = (d, o, c, sg) => d === 0 ? Infinity : Math.abs(((sg > 0 ? c + 1 : c) - o) / d), dd = (d) => d === 0 ? Infinity : Math.abs(1 / d);
    let tx = td(dx, ox, x, sx), ty = td(dy, oy, y, sy), tz = td(dz, oz, z, sz);
    for (let t = 0; t <= max;) {
      if (y >= 0 && y < 256 && tbl.solid[world.getBlock(x, y, z)] && !(clip.on && (clip.a === 0 ? x : clip.a === 1 ? y : z) * clip.dir > clip.s * clip.dir)) return [x, y, z];
      if (tx < ty && tx < tz) { t = tx; tx += dd(dx); x += sx; } else if (ty < tz) { t = ty; ty += dd(dy); y += sy; } else { t = tz; tz += dd(dz); z += sz; }
    }
    return null;
  }
  input.onkey = (code) => {
    if (code === 'Digit0' || code === 'Numpad0') { if (hasPv) { pushClip(); return; } }
    if (code === 'KeyC') { addOrigin(); return; }
    ctl.key(code); if (code === 'F3') { dbg = !dbg; $('f3').style.display = dbg ? '' : 'none'; }
  };
  // 与 pgviz 标签页互通点位（BroadcastChannel，每秒一次；地址栏不动）：发 { from:'game', p1:[x,z,y,yaw], xhair:[x,y,z]|null（准星射线打到的第一个固体方块，旧 hit 的含义）, pv, hour }，收 viz 的同样字段存进 gode.peer
  const bc = new BroadcastChannel('gode-sync'); let urlLive = false, peer = null, lastTod = null;
  bc.onmessage = (e) => {
    const m = e.data; if (m?.from !== 'viz') return; peer = m;
    if (m.pv) setPv(m.pv);
    // 拨盘时间随 p1 一起发来：**值变了才应用**（同一秒的重复广播不再把时钟钉住，tspeed 照常自己走）；viz 复原（null）后允许同样的时间再设一次
    if (m.tod === null) lastTod = null;
    else if (typeof m.tod === 'number' && m.tod !== lastTod) { lastTod = m.tod; clock.hour = ((m.tod % 24) + 24) % 24; }
    // 望向脚下：pitch 贴 −90°，yaw 归 0 —— 相机 screen-up = −Z = 俯视图的地图上方（viz 顶视图 F 是 −Y、D 是 +Z），
    // 于是按下 W（forward = [−sin yaw, 0, −cos yaw]）在俯视图上就是往「上」走
    if (m.tp?.look === 'feet') { p.yaw = 0; p.pitch = -Math.PI / 2 + 0.01; toastMsg('望向脚下（朝地图上方）'); return; }
    if (m.tp) {   // viz 的 ⏎ / 0：直接传送（格中心；yaw 为 null = 不改朝向）
      const yaw = typeof m.tp.yaw === 'number' ? m.tp.yaw : p.yaw, [fx, fy, fz] = freeSpot(m.tp.x, m.tp.y, m.tp.z, yaw);
      Object.assign(p, { x: fx, y: fy, z: fz, vx: 0, vy: 0, vz: 0, fallStart: fy, yaw });
      if (typeof m.tp.pitch === 'number') p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, m.tp.pitch));   // 侧视 = 水平；俯视 A→B = 看向 B
      toastMsg(m.pv ? `正在切片 ${m.pv}（E键+0键关闭）` : `传送 @${Math.floor(m.tp.x)},${Math.floor(m.tp.z)}^${Math.round(m.tp.y)}`);
    }
  };
  setInterval(() => {
    if (!urlLive) return;
    bc.postMessage({ from: 'game', g: G, seed: SEED, p1: [Math.floor(p.x), Math.floor(p.z), Math.round(p.y), +p.yaw.toFixed(3)], xhair: hitTest(), pv: hasPv ? (clip.dir < 0 ? '-' : '') + 'XYZ'[clip.a] + (clip.on ? ':' + clip.s : '') : null, hour: +clock.hour.toFixed(3) });
  }, 1000);

  // 出生点：`p1=@x,z[^y][,yaw]`（与宿主 B index.html 同一套写法；y 缺省 = 该列地表 + 8）优先；
  // 否则问生成器要 `spawn()`（s02 §2），没有 / 超时就回落到 (8,8) 的柱高与海平面较高者。
  // p1 = pgviz「↗ 进游戏」：pitch 固定 −20°（p1 与 index 一样没有 pitch 字段）。
  status('生成出生区块 …');
  const m1 = /^@?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\^(-?\d+(?:\.\d+)?))?(?:,(-?[\d.]+))?(?:,(-?[\d.]+))?/.exec(q.get('p1') || '');
  let pos = m1 ? [+m1[1], m1[3] === undefined ? null : +m1[3], +m1[2], m1[4] === undefined ? 0 : +m1[4], m1[5] !== undefined ? +m1[5] : m1[4] === undefined ? -Math.PI / 9 : 0] : null;   // 带 yaw（pgviz 侧视）= 水平看；不带 = 俯视 −20°
  if (!pos) {
    const sp = await Promise.race([pool.call('spawn', {}).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2000))]);
    if (Array.isArray(sp) && sp.length >= 3 && sp.every(Number.isFinite)) pos = [...sp, 0, 0];
  }
  const cx0 = pos ? Math.floor(pos[0]) >> 4 : 0, cz0 = pos ? Math.floor(pos[2]) >> 4 : 0, px0 = pos ? pos[0] : 8.5, pz0 = pos ? pos[2] : 8.5;
  world.update(px0, pz0, Math.min(rd, 2));
  await new Promise((res, rej) => { const t0 = performance.now(), f = () => world.chunk(cx0, cz0) ? res() : performance.now() - t0 > 20000 ? rej(new Error('出生区块 20 s 没生成出来')) : setTimeout(f, 20); f(); });
  if (pos) {
    const bx = Math.floor(pos[0]), bz = Math.floor(pos[2]);
    p.x = bx + 0.5; p.z = bz + 0.5;   // 与宿主 B 的 p1 一样落在格中心
    p.y = pos[1] ?? Math.max(world.chunk(cx0, cz0).heights[((bz & 15) << 4) | (bx & 15)] + 8, (meta.sea ?? 62) + 8);
    p.yaw = pos[3]; p.pitch = pos[4];
    if (m1) { const [fx, fy, fz] = freeSpot(p.x, p.y, p.z, p.yaw); p.x = fx; p.y = fy; p.z = fz; }   // p1 落在实心方块里时挪到最近的空处
  }
  else { const h = world.chunk(cx0, cz0).heights[(8 << 4) | 8]; p.x = px0; p.z = pz0; p.y = Math.max(h + 1, (meta.sea ?? 62) + 1) + 0.01; }
  p.fallStart = p.y;
  if (q.get('fly') === '1') p.flying = true;
  if (q.get('noclip') === '1') { p.noclip = true; p.flying = true; }

  status('起渲染器 …');
  const VR = await createGl({ THREE, renderer, camera, scene, world, tbl, names: meta.names, ctl, clock, rd: () => rd, clip });
  status(''); urlLive = true;

  // ---- 主循环
  let last = performance.now(), fps = 0, frames = 0, ft = last;
  const sync = () => { camera.position.set(p.x, p.y + p.eyeHeight, p.z); camera.rotation.set(p.pitch, p.yaw, 0); };
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    clock.hour = (clock.hour + clock.speed * dt) % 24;
    ctl.update(dt);
    world.update(p.x, p.z, rd);
    sync(); VR.update(dt); renderer.clear(); VR.render();
    frames++; if (now - ft > 500) { fps = frames * 1000 / (now - ft); frames = 0; ft = now; if (dbg) hud(); }
    requestAnimationFrame(frame);
  }
  const f = (v, n = 2) => v.toFixed(n);
  function hud() {
    const c = world.chunk(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4), bi = c ? meta.biomes?.[c.biomes[((Math.floor(p.z) & 15) << 4) | (Math.floor(p.x) & 15)]] : '-';
    $('f3').textContent = `gode M1 · ${G} seed ${SEED} · ${fps.toFixed(0)} fps\n` +
      `xyz ${f(p.x)} ${f(p.y)} ${f(p.z)}  yaw ${f(p.yaw)} pitch ${f(p.pitch)}${p.flying ? ' fly' : ''}${p.noclip ? ' noclip' : ''}${p.onGround ? ' ground' : ''}\n` +
      `chunk ${Math.floor(p.x) >> 4},${Math.floor(p.z) >> 4} biome ${bi} · loaded ${world.chunks.size} inflight ${world.inflight.size} · gen ${world.n.gen} (${(world.n.genMs / Math.max(1, world.n.gen)).toFixed(1)} ms + light ${(world.n.lightMs / Math.max(1, world.n.gen)).toFixed(1)}) · outside ${world.n.outside} parked ${world.n.parked}\n` +
      VR.stats();
  }
  requestAnimationFrame(frame);

  // ---- Agent 入口
  const raf = () => new Promise(requestAnimationFrame);
  window.gode = {
    world, ctl, pool, VR, tbl, meta, clock, THREE, camera, renderer, p, clip, pushClip, hitTest, get peer() { return peer; },
    pose(x, y, z, yaw, pitch) { Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0 }); if (yaw !== undefined) p.yaw = yaw; if (pitch !== undefined) p.pitch = pitch; },
    // 等区块到齐 + 网格出完（pending = 0）+ 连续 3 帧稳定
    async settle(ms = 20000) {
      const t0 = performance.now(); let ok = 0;
      while (performance.now() - t0 < ms) { await raf(); if (world.settled() && VR.pending() === 0) { if (++ok >= 3) return performance.now() - t0; } else ok = 0; }
      throw new Error(`settle 超时：loaded ${world.chunks.size} inflight ${world.inflight.size} mesh pending ${VR.pending()}`);
    },
    // 同种子 / 同参数热重置：丢掉所有区块，池 onkwarg 一次，按新的到达顺序重新流式加载（genhash 检查用，也是换种子的入口）
    async restart(seed = SEED, kw = parseKw(q.get('kw'))) { world.reset(); await pool.init({ seed: String(seed), g: G, kw }); world.update(p.x, p.z, rd); },
    spawnC: [cx0, cz0],
    stats() { return { fps, loaded: world.chunks.size, inflight: world.inflight.size, n: world.n, pending: VR.pending(), gl: VR.stats() }; },
    errors() { const e = errs; errs = []; return e; },
    set rd(v) { rd = Math.min(16, v); }, get rd() { return rd; },
  };
  // gm.test 垫片（gd / checks.tsv 的入口，s12 §4）：gode 版在 tools/gmtest-g.js
  window.gode.ready = Promise.resolve(window.gode.settle().then(() => ({ g: G, seed: SEED })));
  import('../tools/gmtest-g.js').then((m) => m.install(window.gode));
}
main().catch((e) => { console.error('[gode] boot', e); status('启动失败：' + (e?.message ?? e)); });
