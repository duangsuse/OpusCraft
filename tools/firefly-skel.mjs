// firefly 冒烟：宿主 B（index.html?r=gl）里生成一只骷髅，身旁挂一团像素鬼火（自定义 GLSL），再射一支箭，箭尾挂蓝色火焰；
//   依次截图（鬼火 / 箭飞行中 / 箭插地）并核对生命周期（箭被移除 → 火焰淡出 → onEnd('lost')；骷髅被移除 → 鬼火同理；pane 关闭 → 不画）。
//   node tools/firefly-skel.mjs [--url http://localhost:8765/index.html] [--seed 20240607] [--rd 6]
import { launch, killStray } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const URL0 = opt('url', 'http://localhost:8765/index.html'), SEED = String(opt('seed', '20240607')), RD = +opt('rd', 6);
const poses = JSON.parse(readFileSync(new URL('./bench-b-poses.json', import.meta.url), 'utf8'))[SEED];
if (!poses || !poses.plain) { console.error(`bench-b-poses.json 没有 seed ${SEED} 的 plain 机位：先跑 node tools/bench-b.mjs --find`); process.exit(1); }
mkdirSync('tools/out/firefly', { recursive: true });

// 鬼火：像素水滴 + 两只眼；梢长抽帧闪烁（不位移、不摇晃）。三档色：芯（偏白）/ 体（tint）/ 缘（暗）
const WISP = `
vec4 shade(vec2 uv, float t, float seed, vec3 tint) {
  vec2 p = uv - vec2(0.5, 0.4);
  float tip = 0.42 + 0.08 * step(0.5, ffHash(vec2(floor(t * 8.0), seed)));
  float w = 0.26 * pow(clamp(1.0 - max(p.y, 0.0) / tip, 0.0, 1.0), 0.8);
  float d = p.y < 0.0 ? length(vec2(p.x, p.y * 1.15)) - 0.26 : abs(p.x) - w;
  if (d > 0.0 || p.y > tip) return vec4(0.0);
  float depth = -d;
  vec3 c = depth > 0.13 ? mix(tint, vec3(1.0), 0.75) : depth > 0.06 ? tint : tint * 0.45;
  vec2 e = abs(vec2(p.x, p.y - 0.02));
  if (e.x > 0.06 && e.x < 0.14 && e.y < 0.06) c = vec3(0.02, 0.1, 0.1);
  return vec4(c, 1.0);
}`;
// 箭尾蓝焰：uv.y 0 = 箭尾 → 1 = 梢；逐行宽度抖动（只改宽度，不位移）
const TAIL = `
vec4 shade(vec2 uv, float t, float seed, vec3 tint) {
  float x = abs(uv.x - 0.5) * 2.0;
  float tip = 0.78 + 0.22 * step(0.5, ffHash(vec2(floor(t * 10.0), seed)));
  float k = uv.y / tip; if (k > 1.0) return vec4(0.0);
  float w = pow(1.0 - k, 0.7);
  w += (ffHash(vec2(floor(uv.y * 24.0), floor(t * 10.0) + seed * 7.0)) - 0.5) * 0.25 * w;
  if (x > w) return vec4(0.0);
  vec3 c = x < w * 0.35 ? mix(tint, vec3(1.0), 0.8) : x < w * 0.7 ? tint : tint * tint * 0.7;
  return vec4(c, 1.0);
}`;

killStray();
const b = await launch({ width: 1280, height: 720, tag: 'firefly' });
await b.send('Runtime.enable');
const fail = m => { console.error('FAIL', m); console.error(b.logs.slice(-12).join('\n')); b.close(); process.exit(1); };
await b.send('Page.navigate', { url: `${URL0}?r=gl` });
for (let i = 0; i < 80; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.Game && gg.VR)`).catch(() => false)) break; }
if (!await b.js(`!!(window.gg && gg.VR && gm.firefly)`).catch(() => false)) fail('没有 gm.firefly');

const P = poses.plain;
const setup = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  const G = gg.Game, VR = gg.VR;
  G.start(${JSON.stringify(SEED)}, null, false); G.settings && (G.settings.rd = ${RD});
  for (let i = 0; i < 300 && (i < 8 || gg.ChunkManager.progress() < 1 || VR.pending() > 0); i++) await sleep(500);
  gg.Mobs.clear(); gg.player.noclip = true; gg.player.flying = true;
  Object.assign(gg.player, { x: ${P.x}, y: ${P.y}, z: ${P.z}, yaw: ${P.yaw}, pitch: -0.12, vx: 0, vy: 0, vz: 0 });
  G.paused = true; gg.Sky.time = 3000; await sleep(800);
  const fx = -Math.sin(${P.yaw}), fz = -Math.cos(${P.yaw});       // 视线水平方向
  const sx = ${P.x} + fx * 5, sz = ${P.z} + fz * 5; let sy = Math.floor(${P.y}) + 4;
  while (sy > 0 && !gg.world.isSolid(Math.floor(sx), sy - 1, Math.floor(sz))) sy--;
  const m = gg.Mobs.spawnMob('skeleton', sx, sy, sz);
  m.yaw = m.ryaw = Math.atan2(-fx, -fz) + Math.PI + 0.5;           // 侧对相机
  m.mesh.position.set(sx, sy, sz); m.mesh.rotation.y = m.ryaw;       // 宿主暂停时 Mobs.update 不跑，mesh 位姿手动摆
  window.__ff = { m, sx, sy, sz, fx, fz, ends: [] };
  // 驱动实体：宿主暂停时不会 update，这里每帧手动推进（mesh 位姿、箭的飞行 / 插地都在 Entities.update 里）
  (function step() { gg.Entities.update(1 / 60); requestAnimationFrame(step); })();
  return { sx, sy, sz, ok: !!m };
})()`);
console.log('setup', JSON.stringify(setup));

const shot = async name => { await sleep(350); writeFileSync(`tools/out/firefly/${name}.png`, await b.screenshot()); console.log('shot', name); };

// 1. 鬼火：骷髅模型空间 [+0.75, 1.5, 0.15]，teal
const r1 = await b.js(`(() => {
  const F = gm.firefly, f = window.__ff;
  f.wisp = F.add({ shader: ${JSON.stringify(WISP)}, anchor: { mob: f.m }, offset: [0.75, 1.5, 0.15], size: 0.5, color: [0.3, 1.0, 0.8], pixel: 16, onEnd: (h, why) => f.ends.push(['wisp', why]) });
  return { alive: f.wisp.alive, stats: F.stats() };
})()`);
console.log('wisp', JSON.stringify(r1));
await shot('1-wisp');

// 2. 箭：从骷髅手高处射向右侧（相机视角横向），箭尾挂蓝焰：箭局部 +z = 前进，尾 = -z
const r2 = await b.js(`(() => {
  const F = gm.firefly, f = window.__ff, m = f.m;
  const rx = -Math.cos(${P.yaw}), rz = Math.sin(${P.yaw});       // 朝画面右侧（yaw 约定：前 = (−sin, −cos)，右 = (−cos, sin)）
  f.arrow = gg.Entities.spawnArrow(f.sx, f.sy + 1.5, f.sz, rx * 3, 1.5, rz * 3, 'skeleton', 2);
  f.tail = F.add({ shader: ${JSON.stringify(TAIL)}, anchor: { ent: f.arrow }, offset: [0, 0, -0.3], axis: [0, 0, -1], size: [0.14, 0.55], color: [0.25, 0.55, 1.0], pixel: 6, onEnd: (h, why) => f.ends.push(['tail', why]) });
  return { stats: F.stats() };
})()`);
console.log('arrow', JSON.stringify(r2));
await sleep(150);
await shot('2-arrow-flight');
await sleep(1200);
const stuck = await b.js(`({ stuck: __ff.arrow.stuck, dead: !!__ff.arrow.dead, alive: __ff.tail.alive })`);
console.log('after flight', JSON.stringify(stuck));
await shot('3-arrow-stuck');

// 3. 生命周期：箭移除 → 火焰停在最后位姿淡出 → onEnd('lost')；pane 关 → 不画
const life = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), f = __ff, F = gm.firefly, out = {};
  gg.Entities.remove(f.arrow); await sleep(100);
  out.fading = F.stats().live; out.tailAlive = f.tail.alive;
  await sleep(600); out.tailEnded = !f.tail.alive; out.ends1 = JSON.stringify(f.ends);
  const meshes = () => gg.Game.scene.children.filter(c => c.isMesh && c.geometry && c.geometry.isInstancedBufferGeometry && c.visible).length;
  out.drawnOn = meshes();
  gg.VR.P.firefly = false; await sleep(200); out.drawnOff = meshes(); gg.VR.P.firefly = true;
  gg.Mobs.remove(f.m); await sleep(700);
  out.wispEnded = !f.wisp.alive; out.ends2 = JSON.stringify(f.ends); out.live = F.stats().live;
  return out;
})()`);
console.log('lifecycle', JSON.stringify(life));
const errs = b.logs.filter(l => /error|EXCEPTION|firefly/i.test(l));
console.log(errs.length ? 'console errors:\n' + errs.join('\n') : 'console clean');
b.close();
