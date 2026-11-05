// 资源包 / 天空资产截图（手工验收辅助）：node tools/shots-pack.mjs [--tex res/survivalpack.zip] [--pano res/puresky2k.hdr] [--night res/milky2k.hdr] [--out DIR] [--set k=v,...]
//   出图：ground（bench-b 的 plain 机位，近看地面贴图）+ 每个时刻各一张 sky（朝太阳 / 月亮仰视）。时刻 = Sky.time（0 = 06:00，DAY_LENGTH 一天）
//   --pose cave：ground 换成 bench-b 的另一个机位（近看石头）；--times 逗号分隔，空 = 不出 sky
//   --set 写 VR.P（如 --set texMax=16,panoClamp=0）。REF 模式、钉时间，与 bench-b 同一套「规范帧序列」读回
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch, killStray } from './cdp.mjs';
import { encodePNG } from './png.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const TEX = opt('tex', 'res/survivalpack.zip'), PANO = opt('pano', ''), NIGHT = opt('night', ''), OUT = opt('out', 'tools/out/pack'), SEED = '20240607';
const SET = Object.fromEntries((opt('set', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, isNaN(+v) ? v : +v]; }));
const TIMES = (opt('times', '1500,6000,11600,18000')).split(',').filter(Boolean).map(Number), POSE = opt('pose', 'plain');
mkdirSync(OUT, { recursive: true });
const poses = JSON.parse(readFileSync(new URL('./bench-b-poses.json', import.meta.url), 'utf8'))[SEED];
killStray();
const b = await launch({ width: 1280, height: 657, tag: 'shots-pack' });
await b.send('Runtime.enable');
const q = new URLSearchParams({ r: 'gl' }); if (TEX) q.set('tex', TEX); if (PANO) q.set('pano', PANO); if (NIGHT) q.set('pano_night', NIGHT);
await b.send('Page.navigate', { url: 'http://localhost:8765/index.html?' + q });
for (let i = 0; i < 80; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.VR)`).catch(() => false)) break; }
const info = await b.js(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  const G = gg.Game, VR = gg.VR;
  G.start(${JSON.stringify(SEED)}, null, false);
  const pump = async () => { for (let i = 0; i < 600 && (i < 8 || gg.ChunkManager.progress() < 1 || VR.pending() > 0); i++) { gg.ChunkManager.update(gg.player.x, gg.player.z, 30); await raf(); } };
  await sleep(1000); await pump();
  for (let i = 0; i < 120 && ((${!!TEX} && !gg.ResourcePack.loaded) || (${!!(PANO || NIGHT)} && !/pano|night/.test(VR.pack.sky))); i++) { await raf(); await sleep(100); }
  Object.assign(VR.P, ${JSON.stringify(SET)}); for (const k of Object.keys(${JSON.stringify(SET)})) VR.apply(k);
  gg.Mobs.clear(); G.paused = true; gg.player.noclip = true; gg.player.flying = true;
  VR.D.time = 10; VR.D.cloudX = 0; VR.setRef(1);
  const shot = async (v, t, aim) => {
    gg.Sky.time = t; gg.Weather.amount = gg.Weather.storm = 0;
    Object.assign(gg.player, { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, vx: 0, vy: 0, vz: 0 });
    G.paused = false; await raf(); await raf(); G.paused = true; await pump();
    VR.render(); const F = VR.F;
    if (aim) { const s = F.sunDir[1] > -0.05 ? F.sunDir : F.moonDir; gg.player.yaw = Math.atan2(-s[0], -s[2]); gg.player.pitch = Math.max(0.15, Math.asin(s[1]) - 0.1); G.paused = false; await raf(); await raf(); G.paused = true; }
    gg.Sky.time = t; VR.resetLag(); for (let i = 0; i < 16; i++) { VR.update(0); G.renderer.clear(); VR.render(); }
    const o = VR.readOut(); let bin = ''; const px = o.px; for (let i = 0; i < px.length; i += 8192) bin += String.fromCharCode.apply(null, px.subarray(i, i + 8192));
    return { w: o.w, h: o.h, b64: btoa(bin) };
  };
  window.__sp = { shot };
  return { pack: VR.pack, rp: { loaded: gg.ResourcePack.loaded, count: gg.ResourcePack.count, maps: gg.ResourcePack.maps.size, props: gg.ResourcePack.props }, err: G.renderer.getContext().getError() };
})()`);
console.log(JSON.stringify(info));
const save = async (name, v, t, aim) => {
  const r = await b.js(`window.__sp.shot(${JSON.stringify(v)}, ${t}, ${aim})`);
  writeFileSync(`${OUT}/${name}.png`, encodePNG(r.w, r.h, Buffer.from(r.b64, 'base64'), true)); console.log(`${OUT}/${name}.png`);
};
await save('ground', POSE === 'plain' ? { ...poses.plain, pitch: -0.5 } : poses[POSE], 3000, false);
for (const t of TIMES) await save('sky-' + t, poses.plain, t, true);
const errs = await b.js(`[gg.Game.renderer.getContext().getError(), (window.gg.err || []).slice(-5)]`).catch(e => String(e));
console.log('GL/err', JSON.stringify(errs));
b.close();
