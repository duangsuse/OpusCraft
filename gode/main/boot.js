/* gode/main/boot.js —— gode 宿主（M1）：起 slicer 池 → 世界镜像 → 控制器 → rgl，主循环。
   URL：?g=mini|gp|liq|old|v7|valleys|<worker url>（默认 mini）&seed=（默认 20240607）&rd=（默认 6）&kw=a.b:1,c:2（生成器参数，s02 §2.1）
        &hour=（0..24，默认 10）&tspeed=（时钟快进：游戏小时 / 秒，默认 0 = 钉住）&pos=x,y,z[,yaw,pitch]（不给 = 出生点）&fly=1&noclip=1&r=gl
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
const genUrl = (g) => /^(mini|gp|liq|old|v7|valleys)$/.test(g) ? new URL(`../defl/g/${g}.js`, import.meta.url).href : new URL(g, location.href).href;
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
  input.onkey = (code) => { ctl.key(code); if (code === 'F3') { dbg = !dbg; $('f3').style.display = dbg ? '' : 'none'; } };

  // 出生点：先等 (0,0) 周围的区块，取柱高与海平面的较高者
  status('生成出生区块 …');
  const pos = q.get('pos')?.split(',').map(Number);
  const cx0 = pos ? Math.floor(pos[0]) >> 4 : 0, cz0 = pos ? Math.floor(pos[2]) >> 4 : 0, px0 = pos ? pos[0] : 8.5, pz0 = pos ? pos[2] : 8.5;
  world.update(px0, pz0, Math.min(rd, 2));
  await new Promise((res, rej) => { const t0 = performance.now(), f = () => world.chunk(cx0, cz0) ? res() : performance.now() - t0 > 20000 ? rej(new Error('出生区块 20 s 没生成出来')) : setTimeout(f, 20); f(); });
  if (pos) { p.x = pos[0]; p.y = pos[1]; p.z = pos[2]; if (pos[3] !== undefined) p.yaw = pos[3]; if (pos[4] !== undefined) p.pitch = pos[4]; }
  else { const h = world.chunk(cx0, cz0).heights[(8 << 4) | 8]; p.x = px0; p.z = pz0; p.y = Math.max(h + 1, (meta.sea ?? 62) + 1) + 0.01; }
  p.fallStart = p.y;
  if (q.get('fly') === '1') p.flying = true;
  if (q.get('noclip') === '1') { p.noclip = true; p.flying = true; }

  status('起渲染器 …');
  const VR = await createGl({ THREE, renderer, camera, scene, world, tbl, names: meta.names, ctl, clock, rd: () => rd });
  status('');

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
    world, ctl, pool, VR, tbl, meta, clock, THREE, camera, renderer, p,
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
