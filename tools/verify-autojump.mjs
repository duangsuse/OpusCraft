// 自动跳跃随帧率的稳定性：node tools/verify-autojump.mjs（需要 :8765 静态服务器；无头 Chromium，约 10 s）
// 在平地上砌一道 1 格台阶，玩家按住 W 走向它；按 144 / 60 / 30 / 20 fps 的帧长调 Game.stepPlayer（与主循环同一入口），
// 步行 / 疾跑各验一次：必须登上台阶（y 比地面高 1），且不穿墙、不卡住。另验跳跃顶点（解析值 v²/2g = 1.1025 格）不随帧率下降。
import { launch, killStray } from './cdp.mjs'; import { setTimeout as sleep } from 'node:timers/promises';
killStray();
const b = await launch({ tag: 'autojump', width: 400, height: 300 });
await b.send('Runtime.enable');
await b.send('Page.navigate', { url: 'http://localhost:8765/index.html' });
for (let i = 0; i < 60; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.Game && gg.Game.renderer)`).catch(() => false)) break; }
await sleep(2500);   // Game.init 的尾部（HUD / 菜单）跑完
await b.js(`gg.Game.start('42', null, false)`);
const res = await b.js(`(async () => {
  const out = [], ck = (name, ok, info = '') => out.push({ name, ok: !!ok, info: String(info) });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { Game, Player, Input, world, B, player: p } = gg;
  for (let i = 0; i < 200 && !Game.ready; i++) await sleep(100);
  Game.running = false; Game.paused = false;   // 主循环不再推进，由本脚本按指定帧长调 stepPlayer
  Input.locked = true;
  // 场地：x 20..40, z 20..26，地面 y=Y0（石头），其上全是空气；台阶：x >= 30 的地面再垫 1 格
  const Y0 = 70;
  for (let x = 14; x <= 44; x++) for (let z = 16; z <= 30; z++) { for (let y = Y0 - 2; y < Y0 + 6; y++) world.setBlock(x, y, z, y < Y0 ? B.stone : y === Y0 && x >= 30 ? B.stone : 0); }
  const reset = () => { Object.assign(p, { x: 24.5, y: Y0, z: 23.5, vx: 0, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0, onGround: true, aj: 0, flying: false, noclip: false, sneaking: false, sprinting: false, sprintLatch: false, hunger: 20 }); };
  const run = (fps, sprint, secs) => {
    reset(); Input.keys = { KeyW: true, ShiftLeft: !!sprint };
    const dt = 1 / fps; let tTop = null, xmax = 0;
    for (let t = 0; t < secs; t += dt) { Game.stepPlayer(dt); xmax = Math.max(xmax, p.x); if (tTop === null && p.y >= Y0 + 1 - 1e-3 && p.onGround && p.x > 30.2) tTop = t; }
    Input.keys = {}; return { y: p.y, x: p.x, tTop, xmax };
  };
  // forward 的方向：yaw = -π/2 时 +x？先探测，不对就翻转 yaw
  reset(); Input.keys = { KeyW: true }; for (let i = 0; i < 30; i++) Game.stepPlayer(1 / 60); const dx = p.x - 24.5; Input.keys = {};
  const yawFix = dx > 0 ? -Math.PI / 2 : Math.PI / 2; const orig = reset; const reset2 = () => { orig(); p.yaw = yawFix; };
  for (const sprint of [false, true]) for (const fps of [144, 60, 30, 20]) {
    reset2(); Input.keys = { KeyW: true, ShiftLeft: !!sprint };
    const dt = 1 / fps; let tTop = null, hit = 0;
    for (let t = 0; t < 3; t += dt) { Game.stepPlayer(dt); if (tTop === null && p.y >= Y0 + 1 - 1e-3 && p.onGround && p.x > 30.2) tTop = t; }
    Input.keys = {};
    ck((sprint ? '疾跑' : '步行') + ' @' + fps + 'fps：登上 1 格台阶（疾跑态 ' + p.sprinting + '）', tTop !== null && p.y >= Y0 + 1 - 1e-3 && (!sprint || p.sprinting), 'y=' + p.y.toFixed(3) + ' x=' + p.x.toFixed(2) + ' 登顶 ' + (tTop === null ? '—' : tTop.toFixed(2) + 's'));
  }
  // 跳跃顶点
  for (const fps of [144, 60, 30, 20]) {
    reset2(); p.x = 20; Input.keys = { Space: true }; const dt = 1 / fps; let top = 0;
    for (let t = 0; t < 1; t += dt) { Game.stepPlayer(dt); top = Math.max(top, p.y - Y0); if (t > 0.1 && p.onGround) Input.keys = {}; }
    Input.keys = {}; ck('跳跃顶点 @' + fps + 'fps ≈ 1.10', Math.abs(top - 1.1025) < 0.08, top.toFixed(3));
  }
  return out;
})()`).catch(e => [{ name: '页面检查执行', ok: false, info: e.message }]);
let failed = 0; for (const x of res) { console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.info ? '  (' + x.info + ')' : ''}`); if (!x.ok) failed++; }
b.close(); console.log(failed ? `\n${failed} 项失败` : '\n全部通过'); process.exit(failed ? 1 : 0);
