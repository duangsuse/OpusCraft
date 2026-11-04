// gm.fire 冒烟：宿主 B（index.html?r=gl）里生成一只骷髅，手里挂一支火把火（mob 锚点，随身体转）、地上三团不同粒子数 / 缩放的火，
//   再射一支箭，箭尾挂火。截图后核对：粒子数可调（set）、容量上限报错、锚点消失 → 淡出 → onEnd('lost')、pane 关闭 → 不画。
//   node tools/fire-skel.mjs [--url http://localhost:8765/index.html] [--seed 20240607] [--rd 6]     H=1 有头且不关浏览器；RTX=1 独显
import { launch, killStray } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const URL0 = opt('url', 'http://localhost:8765/index.html'), SEED = String(opt('seed', '20240607')), RD = +opt('rd', 6);
const poses = JSON.parse(readFileSync(new URL('./bench-b-poses.json', import.meta.url), 'utf8'))[SEED];
if (!poses || !poses.plain) { console.error(`bench-b-poses.json 没有 seed ${SEED} 的 plain 机位：先跑 node tools/bench-b.mjs --find`); process.exit(1); }
mkdirSync('tools/out/fire', { recursive: true });

killStray();
const b = await launch({ width: 1280, height: 720, tag: 'fire' });
const fail = m => { console.error('FAIL', m); console.error(b.logs.slice(-12).join('\n')); b.close(); process.exit(1); };
await b.send('Page.navigate', { url: `${URL0}?r=gl` });
for (let i = 0; i < 80; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.Game && gg.VR)`).catch(() => false)) break; }
if (!await b.js(`!!(window.gm && gm.fire && gm.firefly)`).catch(() => false)) fail('没有 gm.fire / gm.firefly');

const P = poses.plain;
const setup = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = gg.Game, VR = gg.VR;
  G.start(${JSON.stringify(SEED)}, null, false); G.settings && (G.settings.rd = ${RD});
  for (let i = 0; i < 300 && (i < 8 || gg.ChunkManager.progress() < 1 || VR.pending() > 0); i++) await sleep(500);
  gg.Mobs.clear(); gg.player.noclip = true; gg.player.flying = true;
  Object.assign(gg.player, { x: ${P.x}, y: ${P.y}, z: ${P.z}, yaw: ${P.yaw}, pitch: -0.12, vx: 0, vy: 0, vz: 0 });
  G.paused = true; gg.Sky.time = 18000; await sleep(800);       // 夜里看火
  const fx = -Math.sin(${P.yaw}), fz = -Math.cos(${P.yaw}), rx = -Math.cos(${P.yaw}), rz = Math.sin(${P.yaw});
  const sx = ${P.x} + fx * 5, sz = ${P.z} + fz * 5; let sy = Math.floor(${P.y}) + 4;
  while (sy > 0 && !gg.world.isSolid(Math.floor(sx), sy - 1, Math.floor(sz))) sy--;
  const m = gg.Mobs.spawnMob('skeleton', sx, sy, sz);
  m.yaw = m.ryaw = Math.atan2(-fx, -fz) + Math.PI + 0.5;
  m.mesh.position.set(sx, sy, sz); m.mesh.rotation.y = m.ryaw;       // 宿主暂停时 Mobs.update 不跑，mesh 位姿手动摆
  window.__f = { m, sx, sy, sz, fx, fz, rx, rz, ends: [] };
  (function step() { gg.Entities.update(1 / 60); requestAnimationFrame(step); })();
  return { sx, sy, sz, ok: !!m };
})()`);
console.log('setup', JSON.stringify(setup));

const shot = async name => { await sleep(500); writeFileSync(`tools/out/fire/${name}.png`, await b.screenshot()); console.log('shot', name); };

const r1 = await b.js(`(() => {
  const f = __f, F = gm.fire, end = n => (h, why) => f.ends.push([n, why]);
  f.hand = F.add({ type: 'torch', anchor: { mob: f.m }, offset: [0.75, 1.0, 0.15], scale: 0.7, onEnd: end('hand') });
  const at = (dx, o) => F.add({ anchor: { at: [f.sx + f.rx * dx, f.sy, f.sz + f.rz * dx] }, ...o });
  f.a = at(-2.5, { scale: 0.6, tongues: 1, sparks: 3, onEnd: end('a') });     // 一根火苗
  f.b = at(2.0, { scale: 1, tongues: 8, sparks: 20, onEnd: end('b') });       // 八根火苗：扇面更宽
  f.c = at(3.5, { type: 'lava', scale: 1.5, sparks: 40, onEnd: end('c') });   // 岩浆火星
  return { stats: F.stats(), counts: [f.hand, f.a, f.b, f.c].map(h => [h.tongues, h.sparks]) };
})()`);
console.log('add', JSON.stringify(r1));
await shot('1-fires');

// 调粒子数：a 火苗 1 → 5、火星 3 → 12；hand 火星清零
const r2 = await b.js(`(() => { __f.a.set({ tongues: 5, sparks: 12 }); __f.hand.set({ sparks: 0 }); return [__f.a, __f.hand].map(h => [h.tongues, h.sparks]); })()`);
console.log('set', JSON.stringify(r2));
await shot('2-counts');

// 箭尾挂火
await b.js(`(() => {
  const f = __f; f.arrow = gg.Entities.spawnArrow(f.sx, f.sy + 1.5, f.sz, f.rx * 3, 1.5, f.rz * 3, 'skeleton', 2);
  f.tail = gm.fire.add({ type: 'fire', anchor: { ent: f.arrow }, offset: [0, 0, -0.25], scale: 0.35, tongues: 2, sparks: 4, onEnd: (h, why) => f.ends.push(['tail', why]) });
})()`);
await sleep(200); await shot('3-arrow-flight');

// 校验：非法参数 / 容量
const errs = await b.js(`(() => {
  const F = gm.fire, out = {}, t = (k, fn) => { try { fn(); out[k] = 'no throw'; } catch (e) { out[k] = e.constructor.name; } };
  const at = { at: [0, 0, 0] };
  t('type', () => F.add({ type: 'x', anchor: at }));
  t('anchor', () => F.add({ anchor: {} }));
  t('scale', () => F.add({ anchor: at, scale: 0 }));
  t('tongues', () => F.add({ anchor: at, tongues: 99 }));
  const hs = []; try { for (let i = 0; i < 40; i++) hs.push(F.add({ anchor: at, tongues: 16, sparks: 64 })); out.capFull = 'no throw'; } catch (e) { out.capFull = e.constructor.name + '@' + hs.length; }
  for (const h of hs) h.remove({ fade: false });
  t('immutable', () => __f.a.set({ type: 'lava' }));
  return out;
})()`);
console.log('validate', JSON.stringify(errs));

// 生命周期：箭移除 → 淡出 → onEnd lost；骷髅移除 → 手上 / 地上的火不受影响（地上的是 at 锚点），手上的火淡出
const life = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), f = __f, F = gm.fire, out = {};
  gg.Entities.remove(f.arrow); await sleep(100); out.tailFading = f.tail.alive;
  await sleep(700); out.tailEnded = !f.tail.alive; out.ends1 = JSON.stringify(f.ends);
  const pts = () => gg.Game.scene.children.filter(c => c.isPoints && c.visible).length;
  out.drawnOn = pts(); gg.VR.P.fireFx = 0; await sleep(200); out.drawnOff = pts(); gg.VR.P.fireFx = 1;
  gg.Mobs.remove(f.m); await sleep(900);
  out.handEnded = !f.hand.alive; out.groundAlive = [f.a, f.b, f.c].every(h => h.alive); out.ends2 = JSON.stringify(f.ends);
  f.b.remove({ fade: false }); out.removedNow = !f.b.alive;
  F.clear(); out.stats = F.stats();
  return out;
})()`);
console.log('lifecycle', JSON.stringify(life));
const bad = b.logs.filter(l => /error|EXCEPTION/i.test(l));
console.log(bad.length ? 'console errors:\n' + bad.join('\n') : 'console clean');
b.close();
