// 水波纹高度场自检（rgl/ripple.js）：戳一下 → 读回波场，看 ① 有数值 ② 向外扩散（非零纹素数增长、峰值衰减）③ 休眠后清零 ④ 玩家入水延迟
//   node tools/ripple-check.mjs        需要 dev 服务器（默认 http://localhost:8765/VoxelCraft.html）
import { setTimeout as sleep } from 'node:timers/promises';
import { launch, killStray } from './cdp.mjs';
killStray();
const b = await launch({ width: 960, height: 540, tag: 'ripple-check' });
await b.send('Page.navigate', { url: 'http://localhost:8765/VoxelCraft.html?r=gl&seed=20240607' });
await sleep(1500);
const r = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(100);
  const g = window.game, VR = g.VR; if (!VR.ripples || !VR.ripples.on) return { err: 'no ripples' };
  g.setTestMode(true); g.startGame(); g.player.noclip = true;
  g.player.pos.set(-17.5, 42.4 - 1.8, -9.5); g.player.vel.set(0, 0, 0); g.worldTime = 0.12;
  for (let i = 0; i < 90; i++) await raf();
  const R = VR.ripples, out = {};
  out.idle = R.probe();
  const c = g.camera.position; R.poke(c.x + 3, c.z, c.x + 4, c.z, 0.35, 1.0);
  R.step(1); out.t1 = R.probe(); R.step(10); out.t11 = R.probe(); R.step(30); out.t41 = R.probe();
  R.step(120); out.t161 = R.probe();
  // 休眠：不再注入，等 awake 走完 → sim 停、纹理清零
  for (let i = 0; i < 400; i++) await raf();
  out.asleep = R.probe(); out.awake = R.awake();
  return out;
})()`);
console.log(JSON.stringify(r, null, 1)); b.close();
