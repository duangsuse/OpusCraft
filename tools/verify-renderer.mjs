// 渲染器接口验证：node tools/verify-renderer.mjs [baseURL]
// 用无头 Chromium + CDP（Node 内置 WebSocket）加载 ?r=v1 / ?r=v2 / ?r=bogus，逐项检查 handover/renderer-refactor.md 中约定的接口。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://localhost:8765/VoxelCraft.html';
const PORT = 9333 + (process.pid % 500);
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${PORT}`, '--window-size=960,600', '--user-data-dir=/tmp/vr-prof-' + PORT, 'about:blank'], { stdio: 'ignore' });

async function cdpConnect() {
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error('chromium did not start');
}
const ws = new WebSocket(await cdpConnect());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(), logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
};
await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

// 在页面内执行的检查（返回 [{name, ok, info}]）
const PAGE_CHECKS = `(async () => {
  const out = []; const ck = (name, ok, info = '') => out.push({ name, ok: !!ok, info: String(info) });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !(window.game && window.game.VR); i++) await sleep(100);
  const g = window.game; ck('window.game 就绪', g);
  if (!g) return out;
  const VR = g.VR;
  ck('VR 已创建', VR, VR && VR.name);
  for (const k of ['buildChunk', 'disposeChunk', 'update', 'render', 'stats']) ck('VR.' + k + ' 是函数', typeof VR[k] === 'function');
  ck('VR.stats() 返回字符串', typeof VR.stats() === 'string', VR.stats());
  ck('U.uSunDir 已共享', VR && g.RCTX.U.uSunDir && g.RCTX.U.uSunDir.value.isVector3);
  ck('GLSL.mat 提供 matSampleLod()', g.RCTX.GLSL.mat.includes('matSampleLod('));
  ck('RCTX.settings 指向主设置', g.RCTX.settings === g.settings);
  if (VR.name.startsWith('v2')) {
    // §8.4 / §8.5：参数 P、面板 DSL 往返、Tweakpane 可用、F4 开关
    const KEYS = ['scale','steps','shadowSteps','shadowStrength','shadowDist','waterClarity','reflStrength','fogA1','sun','exposure',
      'sunAz','sunEl','aoStrength','aoCurve','waterA2','waterA1','waterD2','waterD1','waveStrength','foamWidth'];
    const miss = KEYS.filter(k => typeof VR.P?.[k] !== 'number');
    ck('v2: VR.P 含全部参数', !miss.length, miss.join(','));
    let bad = [];
    for (const [, rows] of VR.panelSpec || []) for (const [, tgt, o] of rows) if (tgt && tgt.__vec2) {
      for (const [k, r] of [[tgt.kx, o.rx], [tgt.ky, o.ry]]) {
        const v = tgt.get()[k], v2 = VR.fromN(VR.toN(v, r), r);
        if (Math.abs(v2 - v) > (r.step || 1e-6) * 0.51) bad.push(k + ':' + v + '→' + v2);
      }
    }
    ck('v2: panelSpec vec2 往返一致', VR.panelSpec && !bad.length, bad.join(' '));
    const pane = await Promise.race([VR.paneReady, sleep(15000).then(() => null)]);
    ck('v2: Tweakpane 面板已创建', pane && document.body.contains(pane.element), pane ? pane.element.className : 'null');
    if (pane) {
      const host = pane.element.parentElement || pane.element;
      const vis = () => host.style.display !== 'none' && host.getBoundingClientRect().width > 0;
      ck('v2: 面板默认可见（右上）', vis() && host.getBoundingClientRect().right > innerWidth - 40);
      const fk = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
      fk(); const h = !vis(); fk(); ck('v2: F4 隐藏/显示面板', h && vis());
      const nb = pane.element.querySelectorAll('.tp-lblv').length;
      ck('v2: 面板绑定数 ≥ 14', nb >= 14, nb + ' 行');
    }
  }
  g.setTestMode(true); g.startGame();
  for (let i = 0; i < 300 && g.pendingChunks > 0; i++) { g.updateChunks(50); await sleep(30); }
  ck('区块全部构建完成', g.pendingChunks === 0, 'pending=' + g.pendingChunks + ' loaded=' + g.chunks.size);
  const all = [...g.chunks.values()], meshed = all.filter(c => c.meshed);
  ck('meshed 区块已有共享光照 c.sky/c.blk', meshed.length && meshed.every(c => c.sky instanceof Uint8Array && c.blk instanceof Uint8Array && c.sky.length === 16 * 16 * 96),
     meshed.length + ' meshed');
  if (VR.ring) {
    const R = VR.ring, own = meshed.filter(c => R.owner[(((c.cz % R.N) + R.N) % R.N) * R.N + (((c.cx % R.N) + R.N) % R.N)] === c.cx + ',' + c.cz);   // v2 槽位归属键 = "cx,cz"（与宿主 ck 无关，ChunkSource 只给坐标）
    ck('v2: 环形纹理尺寸 N=2rd+5', R.N === 2 * g.settings.rd + 5 && R.vox.image.width === R.N * 16, 'N=' + R.N + ' rd=' + g.settings.rd);
    ck('v2: 所有 meshed 区块占有槽位', own.length === meshed.length, own.length + '/' + meshed.length);
    const Hh = meshed.length ? meshed[0].blocks.length / 256 : 0;
    ck('v2: VR.source 存在且 height 与宿主一致', !!VR.source && typeof VR.source.getChunk === 'function' && VR.source.height === Hh, 'source.height=' + (VR.source && VR.source.height) + ' 宿主=' + Hh);
    {   // 段标记（handover §3.1）：逐区块按定义重算全空/全不透明掩码，与列纹理一致
      const BT = VR.blockTable; let bad = 0;
      for (const c of meshed) {
        const s = (((c.cz % R.N) + R.N) % R.N) * R.N + (((c.cx % R.N) + R.N) % R.N);
        let em = 0, fm = 0, my = 0;
        for (let k = 0; k < Hh / 16; k++) {
          let ne = 0, op = 0;
          for (let i = 0; i < 256; i++) for (let y = k * 16; y < k * 16 + 16; y++) { const id = c.blocks[i * Hh + y]; if (id && BT.kind[id]) { ne++; if (y >= my) my = y + 1; } if (BT.opaque[id]) op++; }
          if (!ne) em |= 1 << k; if (op === 4096) fm |= 1 << k;
        }
        if (R.colData[s * 4] !== my || R.colData[s * 4 + 2] !== em || R.colData[s * 4 + 3] !== fm) bad++;
      }
      ck('v2: 列高/段掩码与区块数据一致', bad === 0, bad + '/' + meshed.length + ' 不一致');
    }
    ck('v2: uWorldMaxY 已统计', R.worldMaxY > 0 && R.worldMaxY <= 96, 'worldMaxY=' + R.worldMaxY);
    const e = g.renderer.getContext().getError(); ck('v2: 环形上传无 GL 错误', e === 0, 'glError=' + e + ' uploads=' + R.uploads);
  }
  // v1 风格网格（v2 若不产出网格则跳过）
  const withMesh = meshed.find(c => c.mesh);
  if (withMesh) {
    const ga = withMesh.mesh.geometry.attributes;
    const mb = new g.MeshBuilder();
    ck('MeshBuilder 缓冲类型 Int16/Uint8/Uint8', mb.pos instanceof Int16Array && mb.uv instanceof Uint8Array && mb.dat instanceof Uint8Array);
    ck('顶点 position: ×3', ga.position.itemSize === 3, 'itemSize=' + ga.position.itemSize);
    ck('顶点 aUv: Uint8×2', ga.aUv && ga.aUv.itemSize === 2);
    ck('顶点 aData: Uint8×4', ga.aData && ga.aData.itemSize === 4);
    const mat = withMesh.mesh.material;
    ck('着色器使用 voxLight()', mat.vertexShader.includes('voxLight('));
    ck('着色器使用 matSample()/applyFog()', mat.fragmentShader.includes('matSample(') && mat.fragmentShader.includes('applyFog('));
    ck('材质共享 U.uSkyDarken 对象', mat.uniforms.uSkyDarken && mat.uniforms.uAtlas.value.isDataArrayTexture);
  } else ck('该渲染器不产出区块网格（跳过顶点检查）', true, VR.name);
  // 方块光：放火把 → 重建 → c.blk == 14
  const p = g.player.pos, x = Math.floor(p.x) + 2, z = Math.floor(p.z) + 2;
  let y = 95; while (y > 1 && g.getBlock(x, y - 1, z) === 0) y--;
  const builds = []; const ob = VR.buildChunk; VR.buildChunk = c => { builds.push(c.cx + ',' + c.cz); ob(c); };
  g.setBlock(x, y, z, g.B.TORCH); g.updateChunks(50);
  VR.buildChunk = ob;
  const c = g.chunks.get(g.ck(x >> 4, z >> 4)); const idx = ((x & 15) * 16 + (z & 15)) * 96 + y;
  ck('setBlock → buildChunk 被调用', builds.includes((x >> 4) + ',' + (z >> 4)), builds.join(' '));
  ck('火把方块光写入 c.blk', c.blk[idx] === 14, 'blk=' + c.blk[idx]);
  g.setBlock(x, y, z, 0); g.updateChunks(50);
  ck('移除火把后光照恢复', c.blk[idx] === 0, 'blk=' + c.blk[idx]);
  // 卸载：disposeChunk 必须释放渲染器资源
  const victim = meshed.find(c => c.mesh) || meshed[0];
  VR.disposeChunk(victim);
  ck('disposeChunk 清空 c.mesh / c.waterMesh', !victim.mesh && !victim.waterMesh);
  victim.dirty = true; g.updateChunks(50);
  // 渲染一帧 & GL 错误
  VR.update(0.016); g.renderer.clear(); VR.render();
  const gl = g.renderer.getContext(); const err = gl.getError();
  ck('VR.render() 无 GL 错误', err === 0, 'glError=' + err);
  ck('绘制调用 > 0', g.renderer.info.render.calls > 0, 'calls=' + g.renderer.info.render.calls);
  if (VR.ring) {
    // rd 6→8：重建环形纹理并重传，render 正常
    const rd0 = g.settings.rd; g.settings.rd = 8;
    for (let i = 0; i < 400 && (i < 2 || g.pendingChunks > 0); i++) { g.updateChunks(50); VR.update(0.016); if (i % 4 == 0) await sleep(5); }
    g.renderer.clear(); VR.render(); const e1 = gl.getError();
    ck('v2: rd 6→8 重建后渲染正常', VR.ring.N === 21 && e1 === 0, 'N=' + VR.ring.N + ' glError=' + e1);
    g.settings.rd = rd0; VR.update(0.016); g.renderer.clear(); VR.render();
    ck('v2: rd 恢复后 N 同步', VR.ring.N === 2 * rd0 + 5 && gl.getError() === 0, 'N=' + VR.ring.N);
  }
  // 功能点 1：N / F / E
  const key = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
  key('KeyN'); ck('N 开启 noclip', g.player.noclip === true); key('KeyN'); ck('N 关闭 noclip', g.player.noclip === false);
  g.player.pitch = -1.55; await sleep(300);
  const t = g.target;
  if (t) { g.inv.slots.fill(null); key('KeyF'); const s = g.inv.slots[g.inv.sel]; ck('F 拾取方块进入快捷栏', s && s.id === t.id, 'target=' + t.id + ' got=' + (s && s.id)); }
  else ck('F 拾取方块（无目标，跳过）', true);
  key('KeyE'); ck('E 打开背包', g.uiMode === 'inv');
  ck('全方块面板含所有方块', document.querySelectorAll('#palette .pslot').length >= g.BLOCKS.filter(Boolean).length,
     document.querySelectorAll('#palette .pslot').length + ' 格');
  key('Escape'); ck('Esc 关闭背包', g.uiMode !== 'inv');
  if (VR.name.startsWith('v2') && VR.pane) {
    const host = VR.pane.element.parentElement || VR.pane.element;
    ck('v2: 面板周期末仍可用', host.style.display !== 'none' && document.body.contains(host));
  }
  return out;
})()`;

let failed = 0;
for (const [r, expect] of [['v1', 'v1'], ['v2', 'v2'], ['bogus', 'v1']]) {
  logs.length = 0;
  await send('Page.navigate', { url: `${BASE}?r=${r}` });
  await sleep(1500);
  let res;
  try { res = await evalJS(PAGE_CHECKS); } catch (e) { res = [{ name: '页面检查执行', ok: false, info: e.message }]; }
  const name = res.find(x => x.name === 'VR 已创建')?.info || '?';
  res.unshift({ name: `?r=${r} 选中渲染器 ${expect}`, ok: name.startsWith(expect), info: name });
  const exc = logs.filter(l => l.startsWith('EXCEPTION') || (l.startsWith('error') && !(r === 'bogus' && l.includes('falling back'))));
  res.push({ name: '无未捕获异常/错误日志', ok: exc.length === 0, info: exc.slice(0, 3).join(' | ') });
  console.log(`\n=== ?r=${r} ===`);
  for (const x of res) { console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.info ? '  (' + x.info + ')' : ''}`); if (!x.ok) failed++; }
}
ws.close(); chrome.kill();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
