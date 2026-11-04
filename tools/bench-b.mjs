// 宿主 B（index.html?r=gl）最小机位基准：固定机位出图，--save / --cmp 做逐像素回归（0 px）。
//   node tools/bench-b.mjs [--seed 20240607] [--rd 6] [--views plain,canopy,cave,water,uw] [--size 1280x657]
//                          [--save NAME | --cmp NAME] [--find] [--url http://localhost:8765/index.html] [--r gl]
// 机位：tools/bench-b-poses.json（按 seed 存）。没有该 seed 的条目、或加 --find，就在世界里搜一遍再写回。
//   生成器 / 地形一改，同 seed 的机位会失效 → 重跑 --find，并重新 --save 基线（旧基线不可比）。
// 基线格式与 bench-v2 相同（tools/out/ref/NAME/<view>.bin：w,h 两个 u32 + RGBA8），差异图写到 tools/out/bug/。
// 与 goalP4P5 步骤 1 的关系：这是它「bench 读机位表」那一件的最小版；以后机位表挪进宿主 B 的 c_Bench.poses 时，只换数据来源。
import { launch, killStray } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePNG } from './png.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const flag = k => argv.includes('--' + k);
const URL0 = opt('url', 'http://localhost:8765/index.html'), RID = opt('r', 'gl');
const SEED = String(opt('seed', '20240607')), RD = +opt('rd', 6), [W, H] = opt('size', '1280x657').split('x').map(Number);
const VIEWS = opt('views', 'plain,canopy,cave,water,uw').split(','), SAVE = opt('save', null), CMP = opt('cmp', null), FIND = flag('find');
const POSES = new URL('./bench-b-poses.json', import.meta.url).pathname, SHOTS = 'tools/out/bench-b';
const refDir = n => `tools/out/ref/${n}`;
const store = existsSync(POSES) ? JSON.parse(readFileSync(POSES, 'utf8')) : {};

killStray();
const b = await launch({ width: W, height: H, tag: 'bench-b' });
await b.send('Runtime.enable');
const fail = m => { console.error(m); if (b.logs.length) console.error(b.logs.slice(-8).join('\n')); b.close(); process.exit(1); };
await b.send('Page.navigate', { url: `${URL0}?r=${RID}` });
for (let i = 0; i < 80; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.Game && gg.Game.renderer && gg.VR)`).catch(() => false)) break; }
if (!await b.js(`!!(window.gg && gg.VR)`).catch(() => false)) fail('宿主 B 没有出渲染器（?r=' + RID + '）');

// ── 页面侧：开局、等区块、钉死时间相关项、机位搜索、规范帧序列读回 ──
const init = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  const G = gg.Game, VR = gg.VR, Wd = gg.world, B = gg.B, SEA = gg.SEA_LEVEL, CH = gg.CHUNK_H, EYE = 1.62;
  if (!VR.readOut || !VR.resetLag || !VR.setRef) return { err: '渲染器缺 bench 契约（readOut / resetLag / setRef）：' + VR.name };
  G.start(${JSON.stringify(SEED)}, null, false);
  G.settings && (G.settings.rd = ${RD});
  const pump = async (min) => { let i = 0; for (; i < 600 && (i < 8 || gg.ChunkManager.progress() < 1 || VR.pending() > 0 || (min && [...Wd.chunks.values()].filter(c => c.meshed).length < min)); i++) { gg.ChunkManager.update(gg.player.x, gg.player.z, 30); await raf(); } return i; };
  await sleep(1000); await pump(30);
  gg.Mobs.clear(); G.paused = true; gg.player.noclip = true; gg.player.flying = true;   // 无物理：place 里短暂取消暂停时，水面机位的玩家不会下落 / 入水（位置取决于帧间隔 → 不可重复）
  VR.D.time = 10; VR.D.cloudX = 0; gg.Sky.time = 3000; VR.setRef(1);   // 冻结水波 / 云 / 昼夜；REF 模式（TAA 关、曝光固定，bench.md §4）
  const gb = (x, y, z) => Wd.getBlock(x, y, z), AIR = 0;
  const surf = (x, z) => { let y = CH - 2; while (y > 0 && (gb(x, y, z) === AIR || gb(x, y, z) === B.short_grass)) y--; return y; };
  const p0 = gg.player, X0 = Math.floor(p0.x), Z0 = Math.floor(p0.z), RAD = ${RD} * 16 - 24;
  const found = {};
  { let best = null;   // plain：±6 起伏最小、无水、非树叶的地表
    for (let x = X0 - RAD; x <= X0 + RAD; x += 4) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 4) {
      const h = surf(x, z); if (h <= SEA + 1 || gb(x, h, z) === B.water || gg.isLeaves(gb(x, h, z))) continue;
      let v = 0; for (let dx = -6; dx <= 6; dx += 3) for (let dz = -6; dz <= 6; dz += 3) v += Math.abs(surf(x + dx, z + dz) - h);
      const sc = v * 100 + ((x - X0) ** 2 + (z - Z0) ** 2) * 0.01; if (!best || sc < best.sc) best = { sc, x, z, h };
    }
    if (best) found.plain = { x: best.x + 0.5, y: best.h + 1, z: best.z + 0.5, yaw: 0.6, pitch: -0.04 }; }
  { let best = null;   // canopy：周围树叶最密的树干旁，仰视树冠
    for (let x = X0 - RAD; x <= X0 + RAD; x++) for (let z = Z0 - RAD; z <= Z0 + RAD; z++) {
      const h = surf(x, z); if (!gg.isLeaves(gb(x, h, z))) continue;
      let y = h; while (y > 0 && gg.isLeaves(gb(x, y, z))) y--; if (!gg.isLog(gb(x, y, z))) continue;
      while (y > 0 && gg.isLog(gb(x, y, z))) y--;
      let n = 0; for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) if (gg.isLeaves(gb(x + dx, surf(x + dx, z + dz), z + dz))) n++;
      if (!best || n > best.n) best = { n, x, z, y };
    }
    if (best) found.canopy = { x: best.x + 1.5, y: best.y + 1, z: best.z + 0.5, yaw: 0.6, pitch: 0.45 }; }
  { let best = null;   // cave：地下 9×5×9 空气最多的格，朝最长空气方向平视
    for (let x = X0 - RAD; x <= X0 + RAD; x += 3) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 3) {
      const h = surf(x, z);
      for (let y = 8; y < h - 10; y += 2) {
        if (gb(x, y, z) !== AIR || gb(x, y + 1, z) !== AIR) continue;
        let n = 0; for (let dx = -4; dx <= 4; dx += 2) for (let dy = -2; dy <= 2; dy += 2) for (let dz = -4; dz <= 4; dz += 2) if (gb(x + dx, y + dy, z + dz) === AIR) n++;
        if (!best || n > best.n) best = { n, x, y, z };
      }
    }
    if (best) {
      let by = 0, bl = -1;
      for (let a = 0; a < 16; a++) { const yaw = a / 16 * Math.PI * 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let l = 0; while (l < 40 && gb(Math.floor(best.x + 0.5 + dx * l), best.y + 1, Math.floor(best.z + 0.5 + dz * l)) === AIR) l++;
        if (l > bl) { bl = l; by = yaw; } }
      let y = best.y; while (y > 1 && gb(best.x, y - 1, best.z) === AIR) y--;
      found.cave = { x: best.x + 0.5, y, z: best.z + 0.5, yaw: by, pitch: -0.05 };
    } }
  { let best = null;   // water：离岸最远（7×7 全水）的水面。水面层 = SEA - 1（最上面一格水）
    const top = SEA - 1;
    for (let x = X0 - RAD; x <= X0 + RAD; x += 2) for (let z = Z0 - RAD; z <= Z0 + RAD; z += 2) {
      if (gb(x, top, z) !== B.water) continue;
      let n = 0; for (let dx = -12; dx <= 12; dx += 3) for (let dz = -12; dz <= 12; dz += 3) if (gb(x + dx, top, z + dz) === B.water) n++;
      const sc = n * 1000 - ((x - X0) ** 2 + (z - Z0) ** 2) * 0.01; if (!best || sc > best.sc) best = { sc, x, z };
    }
    if (best) {
      found.water = { x: best.x + 0.5, y: SEA + 3 - EYE, z: best.z + 0.5, yaw: 0.6, pitch: -0.18 };
      let d = 0; while (d < 8 && gb(best.x, top - d - 1, best.z) === B.water) d++;   // uw：水柱里下潜 min(水深-1, 4) 格，仰视 60°
      found.uw = { x: best.x + 0.5, y: top - Math.min(d, 4) + 0.2 - EYE, z: best.z + 0.5, yaw: 0.6, pitch: 1.05 };
    } }
  const pin = { p: null };
  const place = async v => {
    Object.assign(gg.player, { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, vx: 0, vy: 0, vz: 0 });
    gg.Mobs.clear(); G.paused = false; await raf(); await raf(); G.paused = true; await sleep(300); const t0 = performance.now(), n1 = await pump();
    await sleep(800); const n2 = await pump(); window.__bb.last = { n1, n2, ms: Math.round(performance.now() - t0), prog: gg.ChunkManager.progress(), pend: VR.pending() };
    const c = G.camera; pin.p = { p: c.position.clone(), q: c.quaternion.clone(), fov: G.fovBase };   // 固定 fovBase：水下 FOV 缓动（Player.fovTarget × waterFov）取决于帧间隔，不可重复
  };
  const grab = () => {   // 规范帧序列：读回前相机钉回 place 时的位置；resetLag 后固定渲染 16 帧再读（bench.md §4）
    gg.Sky.time = 3000; gg.Weather.amount = gg.Weather.storm = 0; VR.D.time = 10; VR.D.cloudX = 0;   // place 里短暂取消暂停会让这些前进，读回前再钉一次
    const c = G.camera, q = pin.p; c.position.copy(q.p); c.quaternion.copy(q.q); c.fov = q.fov; c.updateProjectionMatrix();
    VR.resetLag(); for (let i = 0; i < 16; i++) { VR.update(0); G.renderer.clear(); VR.render(); }
    const o = VR.readOut(); let bin = ''; const px = o.px; for (let i = 0; i < px.length; i += 8192) bin += String.fromCharCode.apply(null, px.subarray(i, i + 8192));
    return { w: o.w, h: o.h, b64: btoa(bin) };
  };
  window.__bb = { place, grab, pump };
  return { found, name: VR.name, spawn: [X0, Z0], gl: G.renderer.getContext().getError() };
})()`);
if (init.err) fail(init.err);

let poses = store[SEED];
if (FIND || !poses) {
  poses = init.found; store[SEED] = poses;
  writeFileSync(POSES, JSON.stringify(store, null, 1) + '\n');
  console.log(`机位已搜索并写入 ${POSES}（seed ${SEED}）：${Object.keys(poses).join(' ')}`);
}
console.log(`宿主 B ?r=${RID}  seed ${SEED}  rd ${RD}  视口 ${W}x${H}  出生点 ${init.spawn}`);

mkdirSync(SHOTS, { recursive: true });
if (SAVE) mkdirSync(refDir(SAVE), { recursive: true });
let bad = 0;
for (const name of VIEWS) {
  const v = poses[name];
  if (!v) { console.log(`[${name}] 没有机位，跳过`); continue; }
  const r = await b.js(`(async () => { const { place, grab } = window.__bb; await place(${JSON.stringify(v)}); const a = grab(); a.last = window.__bb.last; return a; })()`);
  if (flag('verbose')) console.log(name, JSON.stringify(r.last));
  const px = Buffer.from(r.b64, 'base64');
  if (flag('twice')) {   // 诊断：同一机位同一会话里再读一次。0 = 会话内稳定（漂移只在两次运行之间）；非 0 = 读回序列本身不稳
    const r2 = await b.js(`window.__bb.grab()`), p2 = Buffer.from(r2.b64, 'base64'); let d = 0, mx = 0;
    for (let i = 0; i < px.length; i += 4) { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(px[i + c] - p2[i + c])); if (m) d++; if (m > mx) mx = m; }
    console.log(`[${name}] --twice 同会话再读: ${d} px` + (d ? ` (max Δ${mx})` : ''));
  }
  writeFileSync(`${SHOTS}/${name}.png`, await b.screenshot());
  let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
  const lum = sum / (r.w * r.h * 3);
  let diff = '';
  if (SAVE) writeFileSync(`${refDir(SAVE)}/${name}.bin`, Buffer.concat([Buffer.from(new Uint32Array([r.w, r.h]).buffer), px]));
  if (CMP) {
    const f = `${refDir(CMP)}/${name}.bin`;
    if (!existsSync(f)) diff = '  对比 n/a（无基线）';
    else {
      const ref = readFileSync(f), rw = ref.readUInt32LE(0), rh = ref.readUInt32LE(4);
      if (rw !== r.w || rh !== r.h) { diff = `  对比 尺寸 ${rw}x${rh}≠${r.w}x${r.h}`; bad++; }
      else {
        let d = 0, mx = 0; for (let i = 0; i < px.length; i += 4) { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(px[i + c] - ref[8 + i + c])); if (m) d++; if (m > mx) mx = m; }
        diff = `  对比 ${d} px` + (d ? ` (max Δ${mx})` : ''); if (d) bad++;
        if (d) {   // 差异图：差异 / 本次 / 基准（GL 行序自下而上，整体倒置后顺序也倒过来）
          const w = r.w, h = r.h, o = new Uint8Array(w * h * 12), base = ref.subarray(8);
          for (let i = 0; i < w * h * 4; i += 4) {
            let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(px[i + c] - base[i + c]));
            o.set([m ? 255 : 0, Math.min(255, m * 8), Math.min(255, m * 8), 255], i);
            o.set([px[i], px[i + 1], px[i + 2], 255], w * h * 4 + i);
            o.set([base[i], base[i + 1], base[i + 2], 255], w * h * 8 + i);
          }
          mkdirSync('tools/out/bug', { recursive: true });
          writeFileSync(`tools/out/bug/${CMP}-B-${name}.png`, encodePNG(w, h * 3, o, true));
        }
      }
    }
  }
  console.log(`[${name}] ${r.w}x${r.h}  亮度 ${lum.toFixed(1)}${diff}`);
}
const glErr = await b.js(`gg.Game.renderer.getContext().getError()`);
if (glErr) { console.log('GL 错误 ' + glErr); bad++; }
b.close();
process.exit(bad ? 1 : 0);
