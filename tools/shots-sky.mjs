// 云层 / 水下仰视 截图（手工验收辅助）：node tools/shots-sky.mjs [--set k=v,...] [--out DIR]
//   机位：ground-day（地面仰望白天云）、uw-day / uw-night（水下仰视）、uw-day-flat（水下平视）
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './cdp.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SET = Object.fromEntries((opt('set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, +v]; }));
const OUT = opt('out', 'tools/out/sky'); mkdirSync(OUT, { recursive: true });
const b = await launch({ width: 1280, height: 657, tag: 'shots-sky' });
await b.send('Page.navigate', { url: 'http://localhost:8765/VoxelCraft.html?r=v2&seed=20240607' });
await sleep(1500);
await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(100);
  const g = window.game, VR = g.VR; g.setTestMode(true); g.startGame(); g.player.noclip = true; g.freezeTime = true;
  Object.assign(VR.P, ${JSON.stringify(SET)}); VR.D.time = 10; VR.D.cloudX = 0;
  window.__go = async (v) => {
    g.player.pos.set(v.x, v.y, v.z); g.player.yaw = v.yaw; g.player.pitch = v.pitch; g.player.vel.set(0, 0, 0); g.worldTime = v.time;
    for (let i = 0; i < 2000 && (i < 3 || g.pendingChunks > 0); i++) { g.updateChunks(40); if (i % 3 == 0) await raf(); }
    g.mobs.length = 0; for (let i = 0; i < 10; i++) await raf();
  };
})()`);
const V = {
  'ground-day': { x: 24.5, y: 53, z: 32.5, yaw: 0.6, pitch: 0.35, time: 0.12 },
  'uw-day': { x: -17.5, y: 36, z: -9.5, yaw: 0.6, pitch: 0.9, time: 0.12 },
  'uw-day-flat': { x: -17.5, y: 37, z: -9.5, yaw: 0.6, pitch: 0.25, time: 0.12 },
  'uw-night': { x: -17.5, y: 36, z: -9.5, yaw: 0.6, pitch: 0.9, time: 0.62 },
};
for (const [k, v] of Object.entries(V)) {
  await b.js(`window.__go(${JSON.stringify(v)})`);
  writeFileSync(`${OUT}/${k}.png`, await b.screenshot());
}
console.log('截图:', OUT); b.close();
