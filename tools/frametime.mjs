// goodGL 原版整帧墙钟基线（goal-remix/bench.md §8 / render.md R0）
//   node tools/frametime.mjs [选项]
//     --url URL        默认由本脚本起静态服务载入 goodGL.html
//     --seed N         世界种子（默认 1）           --rd N       视距（默认 6）
//     --scale S        goodGL 的 renderScale（#auto&scale=；resize() 先把像素数封顶 2.1 MP 再乘它，默认 1）
//     --size WxH       视口（默认 1280x657）        --frames N   每组连续提交帧数（默认 60，3 组取中位数）
//     --views a,b      plain,canopy,water（默认全部）  --t N     Game.time（默认 6000）
//     --fog keep|off   off = Game.dbg {fog:0, mist:0}（去雾版，默认；render.md §0）；keep = 原版的雾
//     --ablate         基线 + 每项单独关一次：volumetric clouds taa pbr pom shadowQ=1，
//                      以及 skip:shadow（跳过往阴影图画的所有绘制）skip:bloom（跳过往 bloom 各级画的绘制）
//     --step           用 Game.step(16.7)（含流式加载、UI）而不是 Game.render 计时
//     --json FILE      结果另存为 JSON            --headed     有头模式
// 口径与 bench-v2 的整帧墙钟一致：N 帧连续提交，最后读 1 像素同步一次，3 组取中位数。goodGL 没有 GPU 计时查询，只有墙钟。
// ⚠ shadowQ 只改阴影范围（±150 / ±100），不是开关；真正"关阴影 / bloom"靠包一层 gl.draw*，往对应 FBO 画的调用直接丢掉（只作上界）。
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch, killStray } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
const [W, H] = opt('size', '1280x657').split('x').map(Number);
const SEED = +opt('seed', 1), RD = +opt('rd', 6), SCALE = +opt('scale', 1), FRAMES = +opt('frames', 40), GROUPS = +opt('groups', 7), T = +opt('t', 6000);
const FOG = opt('fog', 'off'), VIEWS = opt('views', 'plain,canopy,water').split(',');

let srv = null, url = opt('url', null);
if (!url) {
  srv = http.createServer(async (q, r) => { try { r.end(await readFile(resolve(ROOT, '.' + q.url.split(/[?#]/)[0]))); } catch { r.statusCode = 404; r.end(); } }).listen(0);
  url = `http://127.0.0.1:${srv.address().port}/goodGL.html`;
}
url += `#auto&seed=${SEED}&rd=${RD}` + (SCALE !== 1 ? `&scale=${SCALE}` : '');

killStray();   // 先清掉残留的无头 Chromium（会抢 GPU，让墙钟作废）
const c = await launch({ width: W, height: H, headed: flag('headed'), tag: 'frametime' });
const fail = e => { console.error(e); c.logs.slice(-10).forEach(l => console.error('  ' + l)); c.close(); srv?.close(); process.exit(1); };
try {
  await c.send('Page.navigate', { url });
  // 载入世界：等 Game.state === 'play'
  let ok = false;
  for (let i = 0; i < 300 && !ok; i++) { await sleep(200); ok = await c.js(`typeof Game !== 'undefined' && Game.state === 'play' && !!window.__autoq`).catch(() => false); }
  if (!ok) throw new Error('goodGL 没有进入 play 状态');

  // 固定一切：手动步进、不跑游戏 tick、晴天、定时间、（去雾）
  await c.js(`(() => {
    Game.manual = true; Game.freezeTicks = true; Game.settings.weather = false; Game.settings.daylight = false;
    const w = Game.weather; w.target = 0; w.rain = 0; w.thunder = false; w.flash = 0;
    Game.time = ${T};
    Game.dbg = ${FOG === 'keep' ? 'null' : '{ fog: 0, mist: 0 }'};
    window.__skip = null; window.__fbo = null;
    // 包一层 draw：跳过往指定 FBO 画的调用（只用于消融上界）
    const gl = Game.renderer.gl, R = Game.renderer;
    const bf = gl.bindFramebuffer.bind(gl); gl.bindFramebuffer = (t, f) => { window.__fbo = f; return bf(t, f); };
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = gl[n].bind(gl);
      gl[n] = (...a) => {
        const s = window.__skip;
        if (s === 'shadow' && window.__fbo === R.shadowFBO) return;
        if (s === 'bloom' && R.targets && R.targets.bloom.some(b => b.f === window.__fbo)) return;
        return o(...a);
      };
    }
    window.__sync = () => { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  })()`);

  // 等流式加载 / 网格化稳定（Worker 是异步的，所以每步之间要真的等一会）
  const settle = async (maxMs = 90000) => {
    let calm = 0; const t0 = Date.now();
    while (calm < 12 && Date.now() - t0 < maxMs) {
      const pend = await c.js(`(Game.step(16.7), Game.world.pool.pendingCount)`);
      calm = pend === 0 ? calm + 1 : 0; await sleep(40);
    }
    if (calm < 12) throw new Error('世界没有在 ' + maxMs + ' ms 内稳定');
  };
  await settle();

  // 机位：在已加载区域里按特征挑点（goodGL 的世界和宿主 A 不同，只能挑相近的地形）
  const views = await c.js(`(() => {
    const w = Game.world, p = Game.player, cx = Math.floor(p.x), cz = Math.floor(p.z), R = ${RD * 16 - 24};
    const top = (x, z) => { if (!w.isLoaded(x, z)) return null; for (let y = 250; y > 0; y--) { const b = w.getBlock(x, y, z); if (b) return { y, b }; } return null; };
    const ground = (x, z) => { for (let y = 250; y > 0; y--) { const b = w.getBlock(x, y, z); if (b && b !== 7 && SH.SOLID[b] && !SH.LEAVES[b] && !SH.LOGS[b] && !SH.FOLIAGE[b]) return y; } return 0; };
    let plain = null, canopy = null, water = null;
    for (let dx = -R; dx <= R; dx += 4) for (let dz = -R; dz <= R; dz += 4) {
      const x = cx + dx, z = cz + dz, t = top(x, z); if (!t) continue;
      let mn = 999, mx = 0, lv = 0, wt = 0, bad = 0;
      for (let a = -12; a <= 12; a += 4) for (let b = -12; b <= 12; b += 4) {
        const q = top(x + a, z + b); if (!q) { bad++; continue; }
        const g = ground(x + a, z + b); mn = Math.min(mn, g); mx = Math.max(mx, g); if (SH.LEAVES[q.b]) lv++; if (q.b === 7) wt++;
      }
      if (bad) continue;
      const g0 = ground(x, z);
      // plain：树叶最少、地面起伏最小、没有水（打分，森林里也能挑到最空的一块）
      const sc = lv * 100 + (mx - mn); if (!wt && t.b !== 7 && !SH.LEAVES[t.b] && (!plain || sc < plain.v)) plain = { x: x + .5, z: z + .5, y: g0 + 1, yaw: 0.6, pitch: -0.04, v: sc, lv };
      if (SH.LEAVES[t.b] && (!canopy || lv > canopy.v)) canopy = { x: x + 1.5, z: z + .5, y: g0 + 1, yaw: 0.6, pitch: 0.45, v: lv };
      if (t.b === 7 && wt >= 2 && (!water || wt > water.v)) water = { x: x + .5, z: z + .5, y: t.y + 3, yaw: 0.6, pitch: -0.15, v: wt };
    }
    return { plain, canopy, water };
  })()`);
  const found = VIEWS.filter(v => views[v]); const miss = VIEWS.filter(v => !views[v]);
  if (miss.length) console.error('没找到机位（换 --seed / --rd）：' + miss.join(','));

  const [pw, ph] = await c.js(`Game.resize()`);
  const info = await c.js(`({ gpu: (() => { const g = Game.renderer.gl, e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })() })`);
  console.log(`# goodGL 原版  seed=${SEED} rd=${RD} t=${T} fog=${FOG} scale=${SCALE}  画布 ${pw}x${ph} = ${(pw * ph / 1e6).toFixed(2)} MP  ${info.gpu}`);

  const setView = async (v) => {
    await c.js(`(() => { const p = Game.player, v = ${JSON.stringify(views[v])}; p.x = p.px = v.x; p.y = p.py = v.y; p.z = p.pz = v.z; p.yaw = v.yaw; p.pitch = v.pitch; p.vx = p.vy = p.vz = 0; Game.time = ${T}; })()`);
    await settle(30000);
  };
  const timeIt = async () => {        // GROUPS 组各 FRAMES 帧，每组最后读 1 像素同步 → 每帧平均，取中位数
    const body = opt('step', null) !== null || flag('step') ? `Game.step(16.7)` : `Game.render(1, 16.7)`;
    return c.js(`(async () => {
      for (let i = 0; i < 12; i++) ${body}; window.__sync();
      const r = [];
      for (let k = 0; k < ${GROUPS}; k++) { const t0 = performance.now(); for (let i = 0; i < ${FRAMES}; i++) { ${body}; } window.__sync(); r.push((performance.now() - t0) / ${FRAMES}); }
      return r;
    })()`);
  };
  const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  const cases = [{ name: '基线', set: '' }];
  if (flag('ablate')) for (const k of ['volumetric', 'clouds', 'taa', 'pbr', 'pom'])
    cases.push({ name: `关 ${k}`, set: `Game.settings.${k} = false;`, undo: `Game.settings.${k} = true;` });
  if (flag('ablate')) cases.push(
    { name: 'shadowQ=1', set: `Game.settings.shadowQ = 1;`, undo: `Game.settings.shadowQ = 2;` },
    { name: 'skip:shadow', set: `window.__skip = 'shadow';`, undo: `window.__skip = null;` },
    { name: 'skip:bloom', set: `window.__skip = 'bloom';`, undo: `window.__skip = null;` });

  const out = {};
  for (const v of found) {
    await setView(v);
    for (const cs of cases) {
      if (cs.set) await c.js(`(() => { ${cs.set} })()`);
      const r = await timeIt(); (out[cs.name] ||= {})[v] = { ms: +med(r).toFixed(2), min: +Math.min(...r).toFixed(2), max: +Math.max(...r).toFixed(2), runs: r.map(x => +x.toFixed(2)) };
      if (cs.undo) await c.js(`(() => { ${cs.undo} })()`);
    }
  }
  // 表：行 = 项，列 = 机位；带 Δ（相对基线）
  const base = out['基线'];
  console.log('| 项 | ' + found.join(' | ') + ' |\n|---|' + found.map(() => '---').join('|') + '|');
  for (const [name, row] of Object.entries(out))
    console.log(`| ${name} | ` + found.map(v => { const r = row[v], d = r.ms - base[v].ms; return name === '基线' ? `${r.ms} ms（min ${r.min}）` : `${r.ms}（min ${r.min}，Δ${d >= 0 ? '+' : ''}${d.toFixed(2)}）`; }).join(' | ') + ' |');
  const shaky = []; for (const [name, row] of Object.entries(out)) for (const v of found) if (row[v].max > row[v].min * 1.3) shaky.push(`${name}/${v} ${row[v].min}–${row[v].max}`);
  if (shaky.length) console.error(`⚠ ${shaky.length}/${Object.keys(out).length * found.length} 格组间离散 > 30%（GPU 被别的进程占用？关掉浏览器等再测，或加大 --groups）：` + shaky.slice(0, 6).join('；'));
  console.log('机位：' + found.map(v => `${v}(${views[v].x | 0},${views[v].y | 0},${views[v].z | 0})`).join('  '));
  const errs = c.logs.filter(l => /error|exception/i.test(l)); if (errs.length) console.error('页面日志有错误：\n  ' + errs.slice(0, 5).join('\n  '));
  if (opt('json', null)) await writeFile(opt('json'), JSON.stringify({ seed: SEED, rd: RD, t: T, fog: FOG, scale: SCALE, canvas: [pw, ph], gpu: info.gpu, views, out }, null, 1));
} catch (e) { fail(e); }
c.close(); srv?.close();
