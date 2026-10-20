// DF 开/关逐像素对比（随机世界）：node tools/df-seeds.mjs 起始种子 结束种子 [gpu|ss] [yaw,yaw,...]
// 每个种子：960×600，出生点 y=60 俯 0.1，冻结时间，参考模式 setRef(1)，渲染 df=0 / df=1 比 ddaRT；ss = SwiftShader
import { launch } from './cdp.mjs';
const [s0, s1, ss] = [+process.argv[2] || 1, +process.argv[3] || 6, process.argv[4] === 'ss']; const YAWS = (process.argv[5] || '').split(',').filter(Boolean).map(Number);
const b = await launch({ tag: 'dfseeds', width: 960, height: 600, gpu: !ss });
for (let seed = s0; seed <= s1; seed++) {
  await b.send('Page.navigate', { url: `http://localhost:8765/VoxelCraft.html?r=v2&seed=${seed}` });
  const r = await b.js(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
    for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(50);
    const g = window.game, VR = g.VR; g.setTestMode(true); g.startGame();
    const settle = async () => { for (let i = 0; i < 3000 && (i < 3 || g.pendingChunks > 0 || VR.df.pending() > 0); i++) { g.updateChunks(40); VR.update(0.016); if (i % 3 == 0) await raf(); } };
    await settle();
    g.player.noclip = true; g.player.pos.y = 60; g.player.pitch = -0.1; await sleep(250); await settle();
    g.freezeTime = true; VR.D.time = 10; VR.D.cloudX = 0; VR.resetLag(); VR.setRef(1);
    const grab = df => { VR.P.df = df; VR.apply('df', 'def'); VR.update(0.016); g.renderer.clear(); VR.render(); VR.render();
      const rt = VR.ddaRT, px = new Uint8Array(rt.width * rt.height * 4); g.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px); return { px, w: rt.width }; };
    const res = [];
    for (const yaw of ${JSON.stringify(YAWS)}.length ? ${JSON.stringify(YAWS)} : [g.player.yaw]) {
      g.player.yaw = yaw; await raf(); await raf(); VR.resetLag();
      const a = grab(0), c = grab(1), out = [];
      for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== c.px[i] || a.px[i + 1] !== c.px[i + 1] || a.px[i + 2] !== c.px[i + 2]) out.push([(i / 4) % a.w, ((i / 4) / a.w) | 0, [...a.px.subarray(i, i + 3)], [...c.px.subarray(i, i + 3)]]);
      res.push({ yaw: +yaw.toFixed(3), n: out.length, first: out.slice(0, 3) });
    }
    return res.filter(r => r.n).length ? res.filter(r => r.n) : 'all 0 px (' + res.length + ' yaws)';
  })()`);
  console.log(seed, JSON.stringify(r));
}
b.close();
