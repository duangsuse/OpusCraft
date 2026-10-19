// 水体检查：合成水池 → 水面噪声高频能量 + 水下雾可见度
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 9600 + (process.pid % 100), BIG = process.argv.includes('--big');
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, '--window-size=1000,600',
  BIG ? '--window-size=2560,1400' : '--window-size=1000,600', '--user-data-dir=/tmp/wa-' + PORT, '--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
async function conn() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error('no'); }
const ws = new WebSocket(await conn());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(), logs = [];
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value; };
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:8765/VoxelCraft.html?r=v2' });
await sleep(2500);
const out = await js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 400 && !(window.game && window.game.VR); i++) await sleep(100);
  const g = window.game, VR = g.VR, B = g.B, U = g.RCTX.U;
  g.setTestMode(true); g.startGame();
  for (let i = 0; i < 900 && g.pendingChunks > 0; i++) { g.updateChunks(50); await sleep(20); }
  const px = () => { const db = new g.THREE.Vector2(); g.renderer.getDrawingBufferSize(db);
    const b = new Uint8Array(db.x * db.y * 4), gl = g.renderer.getContext();
    gl.readPixels(0, 0, db.x, db.y, gl.RGBA, gl.UNSIGNED_BYTE, b); return { w: db.x, h: db.y, b }; };
  const draw = () => { VR.update(0.016); g.renderer.clear(); VR.render(); return px(); };
  // 直接在空中搭一个 7×7 石台 + 2 层水（保证是干净的水面）
  const px0 = Math.floor(g.player.pos.x), pz0 = Math.floor(g.player.pos.z), base = 78;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    g.setBlock(px0 + dx, base, pz0 + dz, B.STONE ?? 3);
    g.setBlock(px0 + dx, base + 1, pz0 + dz, B.WATER);
    g.setBlock(px0 + dx, base + 2, pz0 + dz, B.WATER);
  }
  for (let i = 0; i < 400 && g.pendingChunks > 0; i++) { g.updateChunks(60); await sleep(20); }
  g.player.noclip = true;
  const hf = (img) => { let s = 0, n = 0;
    for (let y = Math.floor(img.h * 0.25); y < img.h * 0.8; y++) for (let x = Math.floor(img.w * 0.2); x < img.w * 0.8; x++) {
      const o = (y * img.w + x) * 4;
      s += Math.abs(img.b[o] - img.b[o + 4]) + Math.abs(img.b[o] - img.b[o + img.w * 4]); n++; }
    return +(s / n).toFixed(3); };
  const stat = (img) => { let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < img.b.length; i += 4) { const v = (img.b[i] + img.b[i + 1] + img.b[i + 2]) / 3; s += v; s2 += v * v; n++; }
    const m = s / n; return { mean: +m.toFixed(1), std: +Math.sqrt(s2 / n - m * m).toFixed(2) }; };
  // ① 水面（正上方俯视）
  g.player.pos.set(px0 + 0.5, base + 2 + 4, pz0 + 0.5); g.player.yaw = 0.4; g.player.pitch = -1.35;
  await sleep(400);
  VR.P.waveStrength = 0; VR.P.waveNoise = 0;     const flat = draw();
  VR.P.waveStrength = 0.06; VR.P.waveNoise = 0.1; const noisy = draw();
  const res = { base, stats: VR.stats() };
  // 时间维：波纹是否动
  const a1 = draw(); await sleep(150); const a2 = draw();
  let tv = 0; for (let i = 0; i < a1.b.length; i += 4) tv += Math.abs(a1.b[i] - a2.b[i]);
  res.surface = { hfFlat: hf(flat), hfNoisy: hf(noisy), statFlat: stat(flat), statNoisy: stat(noisy), motion: +(tv / (a1.w * a1.h)).toFixed(3) };
  // ② 水下（眼睛在水池中间，平视）
  g.player.pos.set(px0 + 0.5, base + 1 + 1.2 - 1.62, pz0 + 0.5); g.player.pitch = 0.05;
  await sleep(400);
  const uw = (far) => { VR.P.uwNear = 2; VR.P.uwFar = far; return draw(); };
  const u18 = uw(18), u44 = uw(44), u8 = uw(8);
  res.under = { f8: stat(u8), f18: stat(u18), f44: stat(u44),
    fog: [U.uFogNear.value, U.uFogFar.value], eyeBlock: g.getBlock(px0, base + 1, pz0) };
  VR.P.uwNear = 2; VR.P.uwFar = 44; VR.P.waveStrength = 0.06; VR.P.waveNoise = 0.05;
  return res;
})()`);
console.log(JSON.stringify(out, null, 1));
if (logs.length) console.log('--- logs ---\n' + logs.slice(0, 6).join('\n'));
ws.close(); chrome.kill();
