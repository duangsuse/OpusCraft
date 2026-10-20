// 主线程区块上传成本：node tools/upload-cost.mjs [url] —— 初次加载 rd 6 全部区块，报告 VR.ring.upMs（整块上传的 CPU 部分，不含 GL 上传）/ uploads 与 updateChunks 总耗时
import { launch } from './cdp.mjs';
const URL_ = process.argv[2] || 'http://localhost:8765/VoxelCraft.html?r=v2';
const b = await launch({ tag: 'upcost' });
await b.send('Page.navigate', { url: URL_ });
const r = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(50);
  const g = window.game, VR = g.VR; g.setTestMode(true); g.startGame();
  let tU = 0; for (let i = 0; i < 2000 && (i < 3 || g.pendingChunks > 0); i++) { const t = performance.now(); g.updateChunks(40); tU += performance.now() - t; await sleep(1); }
  const R = VR.ring; return { uploads: R.uploads, upMs: R.upMs, perUp: R.upMs / R.uploads, updateChunks: tU, chunks: g.chunks.size };
})()`);
console.log(JSON.stringify(r));
b.close();
