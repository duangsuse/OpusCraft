// v2 DDA 固定机位基准（handover/renderer-refactor.md §5.3）
//   node tools/bench-v2.mjs [选项]
//     --url URL         默认 http://localhost:8765/VoxelCraft.html
//     --seed N          世界种子（默认 20240607）      --rd N        视距（默认 6）
//     --scale S         DDA 分辨率（默认 = v2 默认）   --size WxH    视口（默认 1280x657）
//     --frames N        每机位计时帧数（默认 30）       --views a,b   只跑部分机位（plain,canopy,cave,water）
//     --set k=v,...     覆盖 VR.P 参数（如 shadowSteps=0）
//     --no-shade        跳过「跳过平滑光照」的计时（省时间）
//     --shots DIR       保存每机位截图（正常 + 迭代热力图），默认 tools/out/bench
//     --save NAME       保存每机位 ddaRT 原始像素到 tools/out/ref/NAME/（画面一致性基准）
//     --cmp NAME        与已保存的 NAME 逐像素比较，报告差异像素数
//     --json FILE       结果另存为 JSON          --headed      有头模式（核显实测更可信）
//     --swiftshader     用软件渲染（无 GPU 计时，仅步数/fetch 统计）
// 输出：每机位 GPU 分 pass 时间（scene/dda/comp，中位数）、主射线平均迭代、阴影平均迭代、
//       预算耗尽占比、平均 fetch、层级（列跳/砖步/体素步）、着色占比（dda - dda[跳过 smoothLight]）。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
const URL0 = opt('url', 'http://localhost:8765/VoxelCraft.html');
const SEED = +opt('seed', 20240607), RD = +opt('rd', 6), FRAMES = +opt('frames', 30);
const SCALE = opt('scale', null), [W, H] = opt('size', '1280x657').split('x').map(Number);
const VIEWS = opt('views', 'plain,canopy,cave,water').split(',');
const SET = Object.fromEntries((opt('set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, +v]; }));
if (SCALE) SET.scale = +SCALE;
const SHOTS = opt('shots', 'tools/out/bench'), SAVE = opt('save', null), CMP = opt('cmp', null), JSONF = opt('json', null);

const b = await launch({ width: W, height: H, gpu: !flag('swiftshader'), headed: flag('headed'), tag: 'bench-v2' });
const fail = (m) => { console.error(m); if (b.logs.length) console.error(b.logs.slice(-8).join('\n')); b.close(); process.exit(1); };
await b.send('Page.navigate', { url: `${URL0}?r=v2&seed=${SEED}` });
await sleep(1500);

// ── 页面侧：初始化 + 机位搜索 + 测量函数（挂在 window.__bench 上） ──
const init = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raf = () => new Promise(r => requestAnimationFrame(r));
  for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(100);
  const g = window.game; if (!g || g.VR.name !== 'v2') return { err: 'v2 未加载: ' + (g && g.VR && g.VR.name) };
  const VR = g.VR, B = g.B, EYE = 1.62, SEA = 40, CH = 96;
  g.setTestMode(true); g.startGame(); g.player.noclip = true; g.player.vel.set(0, 0, 0);
  g.settings.rd = ${RD};
  Object.assign(VR.P, ${JSON.stringify(SET)});
  g.freezeTime = true; g.worldTime = 0.12;
  VR.D.time = 10; VR.D.cloudX = 0;                    // 冻结水波/云，保证可比
  const settle = async () => {
    for (let i = 0; i < 2000 && (i < 3 || g.pendingChunks > 0); i++) { g.updateChunks(40); VR.update(0.016); if (i % 3 == 0) await raf(); }
    g.mobs.length = 0; g.items.length = 0;
  };
  await settle();
  // 机位搜索（只用已加载区块；同种子结果确定）
  const gb = (x, y, z) => g.getBlock(x, y, z);
  const surf = (x, z) => { let y = CH - 2; while (y > 0 && (gb(x, y, z) === 0 || gb(x, y, z) === B.TALL_GRASS || gb(x, y, z) === B.POPPY || gb(x, y, z) === B.DANDELION)) y--; return y; };
  const p0 = g.player.pos, X0 = Math.floor(p0.x), Z0 = Math.floor(p0.z), RAD = ${RD} * 16 - 24;
  const views = {};
  // 1) plain：周围 ±6 起伏最小、无水的地表，平视远眺
  { let best = null;
    for (let x = X0 - RAD; x <= X0 + RAD; x += 4) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 4) {
      const h = surf(x, z); if (h <= SEA + 1 || gb(x, h, z) === B.WATER || gb(x, h, z) === B.LEAVES) continue;
      let v = 0; for (let dx = -6; dx <= 6; dx += 3) for (let dz = -6; dz <= 6; dz += 3) v += Math.abs(surf(x + dx, z + dz) - h);
      const d2 = (x - X0) ** 2 + (z - Z0) ** 2; const sc = v * 100 + d2 * 0.01;
      if (!best || sc < best.sc) best = { sc, x, z, h };
    }
    views.plain = { x: best.x + 0.5, y: best.h + 1, z: best.z + 0.5, yaw: 0.6, pitch: -0.04 }; }
  // 2) canopy：周围树叶最密的树干旁，仰视掠射树冠
  { let best = null;
    for (let x = X0 - RAD; x <= X0 + RAD; x++) for (let z = Z0 - RAD; z <= Z0 + RAD; z++) {
      const h = surf(x, z); if (gb(x, h, z) !== B.LEAVES) continue;
      let y = h; while (y > 0 && gb(x, y, z) === B.LEAVES) y--; if (gb(x, y, z) !== B.LOG) continue;
      while (y > 0 && gb(x, y, z) === B.LOG) y--;
      let n = 0; for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) if (gb(x + dx, surf(x + dx, z + dz), z + dz) === B.LEAVES) n++;
      if (!best || n > best.n) best = { n, x, z, y };
    }
    if (best) views.canopy = { x: best.x + 1.5, y: best.y + 1, z: best.z + 0.5, yaw: 0.6, pitch: 0.45 }; }
  // 3) cave：地下 9×5×9 空气最多的格，朝最长空气方向平视
  { let best = null;
    for (let x = X0 - RAD; x <= X0 + RAD; x += 3) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 3) {
      const h = surf(x, z);
      for (let y = 8; y < h - 10; y += 2) {
        if (gb(x, y, z) !== 0 || gb(x, y + 1, z) !== 0) continue;
        let n = 0; for (let dx = -4; dx <= 4; dx += 2) for (let dy = -2; dy <= 2; dy += 2) for (let dz = -4; dz <= 4; dz += 2) if (gb(x + dx, y + dy, z + dz) === 0) n++;
        if (!best || n > best.n) best = { n, x, y, z };
      }
    }
    if (best) {
      let by = 0, bl = -1;
      for (let a = 0; a < 16; a++) { const yaw = a / 16 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let l = 0; while (l < 40 && gb(Math.floor(best.x + 0.5 + dx * l), best.y + 1, Math.floor(best.z + 0.5 + dz * l)) === 0) l++;
        if (l > bl) { bl = l; by = yaw; } }
      let y = best.y; while (y > 1 && gb(best.x, y - 1, best.z) === 0) y--;
      views.cave = { x: best.x + 0.5, y, z: best.z + 0.5, yaw: by, pitch: -0.05 };
    } }
  // 4) water：离岸最远（7×7 全水）的海面，眼高水面 +3，略俯视
  { let best = null;
    for (let x = X0 - RAD; x <= X0 + RAD; x += 2) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 2) {
      if (gb(x, SEA, z) !== B.WATER) continue;
      let n = 0; for (let dx = -12; dx <= 12; dx += 3) for (let dz = -12; dz <= 12; dz += 3) if (gb(x + dx, SEA, z + dz) === B.WATER) n++;
      const sc = n * 1000 - ((x - X0) ** 2 + (z - Z0) ** 2) * 0.01;
      if (!best || sc > best.sc) best = { sc, x, z };
    }
    if (best) views.water = { x: best.x + 0.5, y: SEA + 1 + 3 - EYE, z: best.z + 0.5, yaw: 0.6, pitch: -0.18 }; }

  const gl = g.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const place = async (v) => {
    g.player.pos.set(v.x, v.y, v.z); g.player.yaw = v.yaw; g.player.pitch = v.pitch; g.player.vel.set(0, 0, 0);
    await settle(); g.worldTime = 0.12;
    for (let i = 0; i < 4; i++) await raf();
  };
  const timeFrames = async (n) => {
    const s = { scene: [], dda: [], comp: [], total: [], cpu: [] };
    if (!VR.perf.hasTimer) { for (let i = 0; i < n; i++) { await raf(); s.cpu.push(VR.perf.cpuMs); } return s; }
    let last = VR.perf.gpuLast.frame, guard = 0;
    for (let i = 0; i < 3; i++) await raf();      // 丢掉切换后的前几组
    last = VR.perf.gpuLast.frame;
    while (s.dda.length < n && guard++ < n * 20) {
      g.worldTime = 0.12; await raf();
      const p = VR.perf; if (p.gpuLast.frame === last) continue; last = p.gpuLast.frame;
      for (const k of ['scene', 'dda', 'comp', 'total']) s[k].push(p.gpuLast[k]);
      s.cpu.push(p.cpuMs);
    }
    return s;
  };
  // 同步渲染一帧并读回 ddaRT（RGBA8）
  const grab = async (view, raw) => {
    VR.setDebug(view, raw); await raf(); await raf();            // 让着色器编译
    g.worldTime = 0.12; VR.update(0); g.renderer.clear(); VR.render();
    const rt = VR.ddaRT, px = new Uint8Array(rt.width * rt.height * 4);
    g.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px);
    return { w: rt.width, h: rt.height, px };
  };
  // 独立计时合成 pass：帧内的 comp 查询是该帧第一次真正写默认帧缓冲，会把等交换链/vsync 的时间也算进去
  // （实测帧内 ~10 ms，独立 ~1 ms），所以另在两帧之间把 VR.comp 画到同尺寸 RT 上单独计时
  const T = g.THREE, compSc = new T.Scene(), compQ = new T.Mesh(new T.PlaneGeometry(2, 2), VR.comp), compCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  compQ.frustumCulled = false; compSc.add(compQ);
  const compIso = async (n = 10) => {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return [];
    const sz = g.renderer.getDrawingBufferSize(new T.Vector2()), rt = new T.WebGLRenderTarget(sz.x, sz.y, { depthBuffer: true });
    const qs = [];
    for (let k = 0; k < n; k++) {
      await raf();
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      g.renderer.setRenderTarget(rt); g.renderer.render(compSc, compCam); g.renderer.setRenderTarget(null);
      gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
    }
    for (let i = 0; i < 8; i++) await raf();
    const r = qs.map(q => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN).filter(x => !isNaN(x));
    qs.forEach(q => gl.deleteQuery(q)); rt.dispose();
    return r;
  };
  window.__bench = { g, VR, views, place, timeFrames, grab, raf, compIso };
  return { views, gpuName, P: VR.P, hasTimer: VR.perf.hasTimer, spawn: [X0, Z0] };
})()`);
if (init.err) fail(init.err);

console.log(`GPU: ${init.gpuName}   timer: ${init.hasTimer ? '有' : '无（只有步数统计）'}`);
console.log(`seed ${SEED}  rd ${RD}  视口 ${W}x${H}  scale ${init.P.scale}  steps ${init.P.steps}  shadowSteps ${init.P.shadowSteps}` +
  (Object.keys(SET).length ? `  覆盖 ${JSON.stringify(SET)}` : ''));

mkdirSync(SHOTS, { recursive: true });
const refDir = n => `tools/out/ref/${n}`;
if (SAVE) mkdirSync(refDir(SAVE), { recursive: true });
const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const rows = [];
for (const name of VIEWS) {
  const v = init.views[name];
  if (!v) { console.log(`[${name}] 未找到合适机位，跳过`); continue; }
  const r = await b.js(`(async () => {
    const { VR, place, timeFrames, grab, compIso } = window.__bench;
    await place(${JSON.stringify(v)});
    VR.setDebug(0, 0);
    const t = await timeFrames(${FRAMES});
    const ci = await compIso();
    const it = await grab(1, 1), fe = await grab(2, 1), lv = await grab(5, 1);
    const n = it.w * it.h, steps = VR.P.steps;
    let sIt = 0, sSh = 0, exh = 0, sF = 0, lc = 0, lb = 0, lvx = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4, k = it.px[o] + it.px[o + 1] * 256;
      sIt += k; sSh += it.px[o + 2]; if (k >= steps) exh++;
      sF += fe.px[o] + fe.px[o + 1] * 256;
      lc += lv.px[o]; lb += lv.px[o + 1]; lvx += lv.px[o + 2];
    }
    let tShade = null;
    if (${!flag('no-shade')} && VR.perf.hasTimer) { VR.setDebug(3, 0); tShade = await timeFrames(${Math.max(10, FRAMES >> 1)}); }
    const ref = await grab(0, 0);
    VR.setDebug(0, 0);
    // 正常画面像素（base64）供一致性比较
    let s = ''; const px = ref.px; for (let i = 0; i < px.length; i += 32768) s += String.fromCharCode.apply(null, px.subarray(i, i + 32768));
    return { t, ci, tShade: tShade && tShade.dda, w: it.w, h: it.h, it: sIt / n, sh: sSh / n, exh: exh / n, fetch: sF / n,
             lc: lc / n, lb: lb / n, lv: lvx / n, ref: btoa(s), stats: VR.stats() };
  })()`);
  // 截图：正常 + 迭代热力图
  await b.js(`(async () => { const { VR, raf } = window.__bench; VR.setDebug(0, 0); for (let i = 0; i < 4; i++) await raf(); })()`);
  writeFileSync(`${SHOTS}/${name}.png`, await b.screenshot());
  await b.js(`(async () => { const { VR, raf } = window.__bench; VR.setDebug(1, 0); for (let i = 0; i < 4; i++) await raf(); })()`);
  writeFileSync(`${SHOTS}/${name}-iter.png`, await b.screenshot());
  await b.js(`(async () => { const { VR, raf } = window.__bench; VR.setDebug(0, 0); await raf(); })()`);

  const px = Buffer.from(r.ref, 'base64');
  let diff = null;
  if (SAVE) writeFileSync(`${refDir(SAVE)}/${name}.bin`, Buffer.concat([Buffer.from(new Uint32Array([r.w, r.h]).buffer), px]));
  if (CMP) {
    const f = `${refDir(CMP)}/${name}.bin`;
    if (!existsSync(f)) diff = 'n/a';
    else {
      const ref = readFileSync(f), rw = ref.readUInt32LE(0), rh = ref.readUInt32LE(4);
      if (rw !== r.w || rh !== r.h) diff = `尺寸 ${rw}x${rh}≠${r.w}x${r.h}`;
      else { let d = 0, mx = 0; for (let i = 0; i < px.length; i += 4) { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(px[i + c] - ref[8 + i + c])); if (m) d++; if (m > mx) mx = m; }
             diff = `${d} px` + (d ? ` (max Δ${mx})` : ''); }
    }
  }
  const row = { view: name, pos: v, dda: med(r.t.dda), scene: med(r.t.scene), comp: med(r.t.comp), compIso: med(r.ci), total: med(r.t.total),
    cpu: med(r.t.cpu), ddaNoSmooth: r.tShade ? med(r.tShade) : null, it: r.it, sh: r.sh, exh: r.exh, fetch: r.fetch,
    lc: r.lc, lb: r.lb, lv: r.lv, res: `${r.w}x${r.h}`, diff };
  row.shadeShare = row.ddaNoSmooth != null ? (row.dda - row.ddaNoSmooth) / row.dda : null;
  rows.push(row);
  console.log(`[${name}] @${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}  ${r.stats}`);
}

const f1 = x => x == null || isNaN(x) ? '-' : x.toFixed(1), f2 = x => x == null || isNaN(x) ? '-' : x.toFixed(2);
const pc = x => x == null || isNaN(x) ? '-' : (x * 100).toFixed(1) + '%';
const head = ['机位', 'DDA 分辨率', 'gpu scene', 'gpu dda', 'gpu comp*', 'comp 帧内', 's+d+comp*', '主射线迭代', '阴影迭代', '耗尽', 'fetch', '列跳/砖/体素', '平滑光照占比'];
if (CMP) head.push(`vs ${CMP}`);
const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
for (const r of rows) {
  const c = [r.view, r.res, f2(r.scene), f2(r.dda), f2(r.compIso), f2(r.comp), f2(r.scene + r.dda + (isNaN(r.compIso) ? 0 : r.compIso)), f1(r.it), f1(r.sh), pc(r.exh), f1(r.fetch),
    `${f1(r.lc)}/${f1(r.lb)}/${f1(r.lv)}`, pc(r.shadeShare)];
  if (CMP) c.push(r.diff);
  lines.push(`| ${c.join(' | ')} |`);
}
console.log('\n' + lines.join('\n'));
console.log(`\n* comp* = 合成 pass 独立计时；「comp 帧内」含等交换链/vsync，不代表合成本身成本。gpu 各项为 ${FRAMES} 帧中位数（ms）。`);
console.log(`截图: ${SHOTS}/<机位>.png / <机位>-iter.png` + (SAVE ? `   基准像素: ${refDir(SAVE)}/` : ''));
if (JSONF) writeFileSync(JSONF, JSON.stringify({ seed: SEED, rd: RD, size: [W, H], gpu: init.gpuName, P: init.P, rows }, null, 1));
const errs = b.logs.filter(l => l.startsWith('EXCEPTION') || l.startsWith('error'));
if (errs.length) console.log('\n--- 页面错误 ---\n' + errs.slice(0, 6).join('\n'));
b.close();
