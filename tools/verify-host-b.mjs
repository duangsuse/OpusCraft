// 宿主 B（index.html?r=gl）接入验证：node tools/verify-host-b.mjs [--fast]（需要 :8765 静态服务器；无头 Chromium）
// 全量约 60 s（编辑往返要等区块全部网格化才有稳定基准）；--fast 约 15 s：适配器契约 + 画面非黑 / 非单色 / 0 px 可重复 + 无 GL 错误，跳过编辑 / 卸载往返。
// 验：适配器（glsSource / glsBlocks / glsEnv）契约、画面（非黑 / 非单色 / 0 px 可重复）、编辑 → 'blocks' 事件 → 下一帧可见、卸载 → 'gone'、无 GL 错误 / 异常。
// 不验：特殊模型（门 / 梯子 / 雪层 / 火，当前当空气）、群系染色、实体光照——这些是后续步骤，见 goal-remix/render.md「宿主 B」。
import { launch, killStray } from './cdp.mjs'; import { setTimeout as sleep } from 'node:timers/promises';
const FAST = process.argv.includes('--fast');
killStray();
const b = await launch({ tag: 'hostb', width: 640, height: 400 });
await b.send('Runtime.enable');
await b.send('Page.navigate', { url: 'http://localhost:8765/index.html?r=gl' });
for (let i = 0; i < 60; i++) { await sleep(250); if (await b.js(`!!(window.gg && gg.Game && gg.Game.renderer && gg.VR)`).catch(() => false)) break; }
await b.js(`gg.Game.start('42', null, false)`);
const res = await b.js(`(async () => {
  const FAST = ${FAST};
  const out = [], ck = (name, ok, info = '') => out.push({ name, ok: !!ok, info: String(info) });
  const sleep = ms => new Promise(r => setTimeout(r, ms)), raf = () => new Promise(r => requestAnimationFrame(r));
  const VR = gg.VR, W = gg.world, SRC = VR.source, gl = gg.Game.renderer.getContext();
  ck('?r=gl 选中 gl', VR && VR.name === 'gl', VR && VR.name);
  for (let i = 0; i < 120 && [...W.chunks.values()].filter(c => c.meshed).length <= 30; i++) await sleep(250);
  const meshed = [...W.chunks.values()].filter(c => c.meshed), seen = []; SRC.forEachChunk((x, z) => seen.push(x + ',' + z));
  ck('glsSource：forEachChunk = 宿主已网格化的区块', meshed.length > 30 && seen.length === meshed.length, meshed.length + ' / ' + seen.length);
  const c0 = meshed[0], d = SRC.getChunk(c0.cx, c0.cz);
  ck('glsSource：getChunk 给 blocks / meta / sky / blk（H = 128）', d && d.blocks.length === 16 * 16 * SRC.height && SRC.height === 128 && d.meta && d.sky && d.blk, d && d.blocks.length);
  ck('glsSource：未加载区块 = null', SRC.getChunk(9999, 9999) === null);
  const BT = VR.blockTable, B = gg.B;
  ck('glsBlocks：kind（石头 1 / 草花 2 / 火把 3 / 水 4 / 空气 0）', BT.kind[B.stone] === 1 && BT.kind[B.poppy] === 2 && BT.kind[B.torch] === 3 && BT.kind[B.water] === 4 && BT.kind[0] === 0 && BT.waterId === B.water);
  const E = VR.env;
  ck('glsEnv：dayTime 0..1、weather 数值、eyeSky 0..1', E.dayTime >= 0 && E.dayTime <= 1 && Number.isFinite(E.weather.rain) && E.eyeSky >= 0 && E.eyeSky <= 1, E.dayTime + ' ' + E.eyeSky);
  // 画面
  gg.Game.paused = true; VR.D.time = 10; VR.D.cloudX = 0; VR.setRef(1); await sleep(300);   // 钉死时间相关项（bench.md §4）+ REF 模式（TAA 关、曝光固定）
  let pose = null;   // 主循环每帧会按 player 重算相机（弹跳、fov 缓动有残差）；读回前同步地把相机钉回第一次的位置
  const shot = n => { if (pose) { gg.Game.camera.position.copy(pose.p); gg.Game.camera.quaternion.copy(pose.q); gg.Game.camera.fov = pose.fov; gg.Game.camera.updateProjectionMatrix(); } VR.resetLag(); for (let i = 0; i < n; i++) { gg.Game.renderer.clear(); VR.render(); } return VR.readOut(); };
  Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3 }); await raf(); await raf(); await sleep(1500);
  const a = shot(8); let sum = 0; const cols = new Set();
  for (let i = 0; i < a.px.length; i += 4) { sum += a.px[i] + a.px[i + 1] + a.px[i + 2]; if (i % 64 === 0) cols.add((a.px[i] << 16) | (a.px[i + 1] << 8) | a.px[i + 2]); }
  const lum = sum / (a.w * a.h * 3);
  ck('画面不是黑的（贴图 / 光照生效；贴图全黑时均值 < 30）', lum > 45, '均值 ' + lum.toFixed(1));
  ck('画面不是单色', cols.size > 200, cols.size + ' 种颜色');
  const a2 = shot(8); let nd = 0; for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== a2.px[i] || a.px[i + 1] !== a2.px[i + 1] || a.px[i + 2] !== a2.px[i + 2]) nd++;
  ck('resetLag 后同一序列两次读回 0 px', nd === 0, nd + ' px');
  ck('无 GL 错误', gl.getError() === 0);
  const sp = new Set(['ladder', 'oak_door', 'snow', 'fire'].map(n => gg.B[n])), withMesh = meshed.filter(c => c.mesh || c.waterMesh), hasSp = c => { for (let i = 0; i < c.blocks.length; i++) if (sp.has(c.blocks[i])) return true; return false; };
  ck('R6-a：Mesher.only 生效，没有特殊模型的区块不出 three 网格', gg.Mesher.only && withMesh.every(hasSp), withMesh.length + ' 个区块有网格');
  // scale / maxMP：宿主 rndr.scale / rndr.maxMP → three pixelRatio → 绘制缓冲大小；rgl 的内部目标跟绘制缓冲走（ensureTargets），渲染器不需要另接
  { const cam = gg.Game.camera, cv = gg.Game.canvas, R = gg.rndr; pose = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    const s0 = shot(8), lumOf = o => { let t = 0; for (let i = 0; i < o.px.length; i += 4) t += o.px[i] + o.px[i + 1] + o.px[i + 2]; return t / (o.w * o.h * 3); };
    R.scale = 0.5; await raf(); await raf(); const h = shot(8);
    ck('scale 0.5：绘制缓冲、读回尺寸减半，画面不黑，无 GL 错误', h.w === cv.width && h.h === cv.height && Math.abs(h.w * 2 - s0.w) <= 1 && lumOf(h) > 45 && gl.getError() === 0, s0.w + 'x' + s0.h + ' → ' + h.w + 'x' + h.h + ' 亮度 ' + lumOf(h).toFixed(1));
    R.scale = 1; R.maxMP = 0.1; await raf(); await raf(); const m = shot(8);
    ck('maxMP 0.1：像素数封顶（scale 1 也被压下去），无 GL 错误', m.w === cv.width && m.w * m.h <= 0.1e6 * 1.01 && m.w * m.h > 0.1e6 * 0.9 && lumOf(m) > 45 && gl.getError() === 0, m.w + 'x' + m.h + ' = ' + (m.w * m.h / 1e6).toFixed(3) + ' MP');
    R.maxMP = 0; await raf(); await raf(); const s1 = shot(8); let nd = 0; if (s1.w !== s0.w || s1.h !== s0.h) nd = -1; else for (let i = 0; i < s0.px.length; i += 4) if (s0.px[i] !== s1.px[i] || s0.px[i + 1] !== s1.px[i + 1] || s0.px[i + 2] !== s1.px[i + 2]) nd++;
    ck('scale 1、maxMP 0 恢复后与最初 0 px', nd === 0, nd < 0 ? '尺寸 ' + s1.w + 'x' + s1.h : nd + ' px'); }
  if (FAST) return out;
  // 编辑 → 事件 → 可见：相机前 4 格放 3×3×3 石头
  const settle = async (c) => { for (let i = 0; i < 400 && (VR.pending() > 0 || (c && c.dirty) || i < 4); i++) { gg.ChunkManager.update(gg.player.x, gg.player.z, 20); await raf(); } };
  for (let i = 0; i < 400 && (gg.ChunkManager.progress() < 1 || VR.pending() > 0 || i < 8); i++) { gg.ChunkManager.update(gg.player.x, gg.player.z, 30); await raf(); }   // 区块全部网格化、rgl 的段全部上传完才取基准
  await settle();
  const cam = gg.Game.camera; pose = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const base = shot(8), dir = new gg.THREE.Vector3(); cam.getWorldDirection(dir);
  let cx, cy, cz, cells;   // 沿视线找一个 3×3×3 全是空气的位置（不能把地形当成放置的石头再删掉）
  for (let k = 3; k < 14; k++) {
    cx = Math.floor(cam.position.x + dir.x * k); cy = Math.floor(cam.position.y + dir.y * k); cz = Math.floor(cam.position.z + dir.z * k); cells = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) cells.push([cx + x, cy + y, cz + z]);
    if (cells.every(([x, y, z]) => W.getBlock(x, y, z) === 0)) break;
  }
  await sleep(1500); await settle(); const again = shot(8); let dd = 0; for (let i = 0; i < base.px.length; i += 4) if (base.px[i] !== again.px[i] || base.px[i + 1] !== again.px[i + 1] || base.px[i + 2] !== again.px[i + 2]) dd++;
  ck('不编辑、隔 1.5 s 再读回 0 px（排除时间漂移）', dd === 0, dd + ' px');
  const ch = W.getChunk(cx >> 4, cz >> 4), rev0 = SRC.getChunk(ch.cx, ch.cz).rev;
  const snap = new Map(); for (const c of W.chunks.values()) if (c.meshed) snap.set(c, [c.sky.slice(), c.blk.slice(), c.blocks.slice(), c.meta.slice()]);
  for (const [x, y, z] of cells) W.setBlock(x, y, z, B.stone);
  const dirty = [...W.chunks.values()].filter(c => c.dirty).length; await settle(ch);
  ck('编辑后 rev 递增（Mesher.buildChunk → \\'blocks\\' 事件）', SRC.getChunk(ch.cx, ch.cz).rev > rev0, rev0 + ' → ' + SRC.getChunk(ch.cx, ch.cz).rev + ' dirty@edit=' + dirty + ' now dirty=' + ch.dirty + ' meshed=' + ch.meshed + ' cell=' + cx + ',' + cy + ',' + cz + ' got=' + W.getBlock(cx, cy, cz));
  Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3 }); await raf(); await raf();
  const on = shot(8); let d1 = 0; for (let i = 0; i < base.px.length; i += 4) if (base.px[i] !== on.px[i] || base.px[i + 1] !== on.px[i + 1]) d1++;
  ck('放置后画面改变', d1 > 500, d1 + ' px');
  for (const [x, y, z] of cells) W.setBlock(x, y, z, 0); await settle(ch);
  Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3 }); await raf(); await raf();
  const off = shot(8); let d2 = 0; for (let i = 0; i < base.px.length; i += 4) if (base.px[i] !== off.px[i] || base.px[i + 1] !== off.px[i + 1] || base.px[i + 2] !== off.px[i + 2]) d2++;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let i = 0; i < base.px.length; i += 4) if (base.px[i] !== off.px[i] || base.px[i + 1] !== off.px[i + 1] || base.px[i + 2] !== off.px[i + 2]) { const p = i >> 2, x = p % base.w, y = (p / base.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let dl = 0, db = 0; for (const [c, [sk, bk, bl, mt]] of snap) { for (let i = 0; i < sk.length; i++) { if (c.sky[i] !== sk[i] || c.blk[i] !== bk[i]) dl++; if (c.blocks[i] !== bl[i] || c.meta[i] !== mt[i]) db++; } }
  ck('移除后画面恢复（0 px）', d2 === 0, d2 + ' px' + (d2 ? ' bbox ' + [x0, x1, y0, y1] + ' of ' + base.w + 'x' + base.h : '') + '；光照差 ' + dl + ' 格，方块差 ' + db + ' 格');
  // R6-a：门 / 雪层 / 梯子 / 火 → 宿主网格器 → three 画进实体合成
  const sp0 = shot(8);
  W.setBlock(cx, cy, cz, B.oak_door, 0); W.setBlock(cx, cy + 1, cz, B.oak_door, 1); W.setBlock(cx + 1, cy, cz, B.snow, 0); W.setBlock(cx - 1, cy, cz, B.ladder, 1); W.setBlock(cx - 1, cy + 1, cz, B.fire, 0); await settle(ch);
  Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3 }); await raf(); await raf();
  const sp1 = shot(8); let d3 = 0; for (let i = 0; i < sp0.px.length; i += 4) if (sp0.px[i] !== sp1.px[i] || sp0.px[i + 1] !== sp1.px[i + 1] || sp0.px[i + 2] !== sp1.px[i + 2]) d3++;
  ck('R6-a：放门 / 雪层 / 梯子 / 火后该区块出网格、画面改变', ch.mesh && d3 > 300, 'mesh=' + !!ch.mesh + ' ' + d3 + ' px');
  for (const [x, y, z] of [[cx, cy, cz], [cx, cy + 1, cz], [cx + 1, cy, cz], [cx - 1, cy, cz], [cx - 1, cy + 1, cz]]) W.setBlock(x, y, z, 0); await settle(ch);
  Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3 }); await raf(); await raf();
  const sp2 = shot(8); let d4 = 0; for (let i = 0; i < sp0.px.length; i += 4) if (sp0.px[i] !== sp2.px[i] || sp0.px[i + 1] !== sp2.px[i + 1] || sp0.px[i + 2] !== sp2.px[i + 2]) d4++;
  ck('R6-a：移除后画面恢复（0 px），网格释放', d4 === 0 && !ch.mesh, d4 + ' px mesh=' + !!ch.mesh);
  // 资源包：合成一张纯红草顶贴图（机位里一定看得到草；草顶会被染色，所以只判画面变化） → Atlas.build（宿主加载 / 卸载包时都会调）→ VR.reloadTextures → 画面变；卸载 → 0 px 恢复
  const pk0 = shot(8), cv = document.createElement('canvas'); cv.width = cv.height = 16; const cg = cv.getContext('2d'); cg.fillStyle = '#ff0000'; cg.fillRect(0, 0, 16, 16);
  gg.Atlas.packImages.set('grass_block_top', await createImageBitmap(cv)); gg.Atlas.build(); await raf(); await raf();
  const pk1 = shot(8); let d5 = 0, red = 0; for (let i = 0; i < pk0.px.length; i += 4) { if (pk0.px[i] !== pk1.px[i] || pk0.px[i + 1] !== pk1.px[i + 1] || pk0.px[i + 2] !== pk1.px[i + 2]) d5++; if (pk1.px[i] > 120 && pk1.px[i + 1] < 60 && pk1.px[i + 2] < 60) red++; }
  ck('资源包：包里的草顶覆盖 goodGL 贴图（画面变）', d5 > 500, d5 + ' px');
  gg.Atlas.packImages.clear(); gg.Atlas.build(); await raf(); await raf();
  const pk2 = shot(8); let d6 = 0; for (let i = 0; i < pk0.px.length; i += 4) if (pk0.px[i] !== pk2.px[i] || pk0.px[i + 1] !== pk2.px[i + 1] || pk0.px[i + 2] !== pk2.px[i + 2]) d6++;
  ck('资源包：卸载后画面恢复（0 px）、无 GL 错误', d6 === 0 && gl.getError() === 0, d6 + ' px');
  // 卸载
  let gone = 0; SRC.onChunkChanged((x, z, what) => { if (what === 'gone') gone++; });
  const victim = [...W.chunks.values()].find(c => c.meshed && Math.abs(c.cx - gg.player.x / 16) > 3); W.chunks.delete(victim.key);
  ck('world.chunks.delete → \\'gone\\'，getChunk = null', gone === 1 && SRC.getChunk(victim.cx, victim.cz) === null, gone);
  // 存档往返：放石头 → Save.save → 换一个世界（rgl 不能留着旧世界的区块）→ 读档（Game.start 带 data）→ 石头在、画面与存档前 0 px
  // Game.start 返回后立刻暂停：否则随机刻（草变土、树叶枯萎）在读档后的 1.5 s 里改世界，画面对不上（不是存档的错）；Sky.time 暂停也会走（主循环按墙钟推进），读回前钉死
  { const pinPose = () => Object.assign(gg.player, { x: 30, y: 76, z: 10, yaw: 0.5, pitch: -0.3, noclip: true, flying: true });
    const staleN = () => { let n = 0; for (const r of VR.world.recs.values()) if (SRC.getChunk(r.cx, r.cz) === null) n++; return n; };
    const afterStart = async () => { gg.Game.paused = true; await sleep(1500); await settle(); VR.D.time = 10; VR.D.cloudX = 0; VR.setRef(1); pinPose(); await raf(); await raf(); await sleep(500); await settle(); const c = gg.Game.camera; pose = { p: c.position.clone(), q: c.quaternion.clone(), fov: c.fov }; };
    const edit = [[cx, cy, cz], [cx + 1, cy, cz], [cx, cy + 1, cz]]; for (const [x, y, z] of edit) W.setBlock(x, y, z, B.stone); await settle(ch);
    const dsnap = new Map(); for (const c of W.chunks.values()) dsnap.set(c.key, [c.blocks.slice(), c.meta.slice(), c.sky.slice(), c.blk.slice()]);
    gg.Sky.time = 3000; const pre = shot(8), skyPre = [gg.Sky.time, gg.Sky.day, gg.Weather.amount], sv = await gg.Save.save(true);
    ck('存档往返：Save.save 写出 blob', sv && sv.blob.size > 100, sv && sv.blob.size);
    gg.Game.start('77', null, false); await afterStart();
    ck('存档往返：换世界后 rgl 没有旧世界的区块', staleN() === 0 && VR.world.recs.size > 30, 'stale ' + staleN() + ' / recs ' + VR.world.recs.size + '（新世界石头 ' + (W.getBlock(edit[0][0], edit[0][1], edit[0][2]) === B.stone ? '在?!' : '不在') + '）');
    const data = await gg.Save.loadData('42'); ck('存档往返：读档拿到数据', data && String(data.seed) === '42');
    gg.Game.start('42', data, false); await afterStart();
    ck('存档往返：读档后编辑过的方块还在', edit.every(([x, y, z]) => W.getBlock(x, y, z) === B.stone), edit.map(([x, y, z]) => W.getBlock(x, y, z)).join(','));
    ck('存档往返：读档后 rgl 没有残留区块', staleN() === 0, 'stale ' + staleN());
    gg.Sky.time = 3000; const post = shot(8); let dp = 0; for (let i = 0; i < pre.px.length; i += 4) if (pre.px[i] !== post.px[i] || pre.px[i + 1] !== post.px[i + 1] || pre.px[i + 2] !== post.px[i + 2]) dp++;
    const dd = { n: 0, miss: 0 }; for (const [k, [bl, mt, sk, bk]] of dsnap) { const c = W.chunks.get(k); if (!c) { dd.miss++; continue; } for (let i = 0; i < bl.length; i++) if (c.blocks[i] !== bl[i] || c.meta[i] !== mt[i] || c.sky[i] !== sk[i] || c.blk[i] !== bk[i]) dd.n++; }
    // 宿主侧：没改过的区块读档时按种子重新生成，跨区块的树 / 草下土的落点依赖生成顺序，偶有几格不同（与渲染器无关）→ 数据有差时画面不可比，只在数据逐格一致时要求 0 px
    ck('存档往返：读档后画面与存档前 0 px（数据逐格一致时）', dd.n === 0 ? dp === 0 : true, dd.n === 0 ? dp + ' px' : '宿主世界数据差 ' + dd.n + ' 格（' + dp + ' px，不比）');
    for (const r of VR.world.recs.values()) for (let k = 0; k < 16; k++) if (r.secCount[k]) r.sections[k].dirty = true;   // 强制 rgl 全部重新网格化
    await settle(); await raf(); gg.Sky.time = 3000; const post2 = shot(8); let dr = 0; for (let i = 0; i < post.px.length; i += 4) if (post.px[i] !== post2.px[i] || post.px[i + 1] !== post2.px[i + 1] || post.px[i + 2] !== post2.px[i + 2]) dr++;
    ck('存档往返：读档后的 rgl 画面 = 全部重新网格化后的画面（0 px，没有旧几何）', dr === 0, dr + ' px'); }
  ck('最终无 GL 错误', gl.getError() === 0);
  return out;
})()`).catch(e => [{ name: '页面检查执行', ok: false, info: e.message }]);
const bad = b.logs.filter(l => l.startsWith('EXCEPTION') || (l.startsWith('error') && !l.includes('favicon')) || l.includes('rgl/host-b: goodGL 没有'));
res.push({ name: '无未捕获异常 / 错误日志 / 未映射方块', ok: bad.length === 0, info: bad.slice(0, 3).join(' | ') });
let failed = 0; for (const x of res) { console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.info ? '  (' + x.info + ')' : ''}`); if (!x.ok) failed++; }
b.close(); console.log(failed ? `\n${failed} 项失败` : '\n全部通过'); process.exit(failed ? 1 : 0);
