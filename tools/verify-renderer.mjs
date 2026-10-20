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
    if (VR.onChunkEvent && VR.source.emit) {   // §10.5-2：onChunkChanged(what) 三条路径 + rev 去重 + aux
      const SRC = VR.source, c0 = meshed.find(c => c.cx === Math.floor(g.player.pos.x / 16) + 1 && c.cz === Math.floor(g.player.pos.z / 16)) || meshed[0];
      const s0 = (((c0.cz % R.N) + R.N) % R.N) * R.N + (((c0.cx % R.N) + R.N) % R.N), Hh = SRC.height;
      const cnt = () => ({ u: R.uploads, l: R.lightUploads, c: R.clears, d: R.dedup });
      let a = cnt(); VR.onChunkEvent(c0.cx, c0.cz, 'blocks'); let b = cnt();
      ck('v2: 同 rev 重发 → 去重不重传', b.u === a.u && b.d === a.d + 1, JSON.stringify([a, b]));
      // 'light'：改 sky 后发 light → 只有 G 通道变，砖/列高不重算
      const i0 = (5 * 16 + 7) * Hh + Hh - 1, sk0 = c0.sky[i0], col0 = R.colData.slice(s0 * 4, s0 * 4 + 4).join();
      c0.sky[i0] = (sk0 + 3) & 15; a = cnt(); SRC.emit(c0, 'light'); b = cnt();
      const vb = R.mir[s0].length / (16 * Hh * 16), mo = ((7 * Hh + Hh - 1) * 16 + 5) * vb;
      ck("v2: 'light' 走 G 通道快路径", b.l === a.l + 1 && b.u === a.u && R.mir[s0][mo + 1] === ((c0.sky[i0] << 4) | c0.blk[i0]) && R.colData.slice(s0 * 4, s0 * 4 + 4).join() === col0,
         JSON.stringify([a, b]) + ' G=' + R.mir[s0][mo + 1]);
      c0.sky[i0] = sk0; SRC.emit(c0, 'light');
      // 'blocks' + aux（保守值）：列高按 aux 走
      const gc = SRC.getChunk; SRC.getChunk = (x, z) => { const d = gc.call(SRC, x, z); if (d && x === c0.cx && z === c0.cz) d.aux = { maxY: Hh, sectEmpty: 0, sectFull: 0, brick: new Uint8Array(16 * Hh / 4).fill(1) }; return d; };
      a = cnt(); SRC.emit(c0, 'blocks'); b = cnt();
      ck("v2: 'blocks' 采用 aux.maxY/段掩码", b.u === a.u + 1 && R.colData[s0 * 4] === Hh && R.colData[s0 * 4 + 2] === 0, 'maxY=' + R.colData[s0 * 4]);
      SRC.getChunk = gc; SRC.emit(c0, 'blocks');
      a = cnt(); SRC.emit(c0, 'gone'); b = cnt();
      ck("v2: 'gone' 清槽位（列高 0）", b.c === a.c + 1 && R.owner[s0] === null && R.colData[s0 * 4] === 0, JSON.stringify([a, b]));
      SRC.built(c0);
      ck('v2: gone 后 built 重新占槽', R.owner[s0] === c0.cx + ',' + c0.cz && R.colData[s0 * 4] > 0);
    }
    if (VR.df) {   // P2 距离场（§3.4 / goal-renderapi §4 UVOX.A）
      for (let i = 0; i < 300 && VR.df.pending() > 0; i++) { VR.update(0.016); await sleep(20); }
      ck('v2: DF Worker 全部回包', VR.df.pending() === 0 && R.dfDone > 0, 'sent ' + (R.dfSent) + ' done ' + (R.dfDone) + ' drop ' + (R.dfDrop));
      // 不变量 v−1 ≤ 真实距离：按定义独立重算 DF 占据（kind≠0 ∧ 非流体，v2 id ≥192 算占据；流体表皮 = 6 邻有非流体 / 越界 / 跨区块），
      // 26 邻膨胀求真实切比雪夫距离（y<0 视为占据），与镜像 A 低 5 位比较；占据格必须 v = 1
      const dfCheck = (label) => {
      const BT = VR.blockTable, Hh = VR.source.height, T = VR.df.T;
      const cls = (id) => id === 0 ? 0 : id >= 192 ? 1 : !BT.kind[id] ? 0 : (BT.kind[id] === 4 || id === BT.waterId) ? 2 : 1;
      let bad = 0, nChk = 0, nCells = 0, hist = new Array(18).fill(0), worst = '';
      for (const c of meshed.slice(0, 12)) {
        const s = (((c.cz % R.N) + R.N) % R.N) * R.N + (((c.cx % R.N) + R.N) % R.N), m = R.mir[s]; if (!m) continue;
        const mo = (x, y, z) => ((z * Hh + y) * 16 + x) * 4, at = (x, y, z) => (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y >= Hh) ? -1 : cls(m[mo(x, y, z)]);
        const N3 = 16 * Hh * 16, dist = new Uint8Array(N3).fill(99), ix = (x, y, z) => (x * 16 + z) * Hh + y;
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < Hh; y++) {
          const k = at(x, y, z);
          let occ = k === 1;
          if (k === 2) for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) if (at(x + dx, y + dy, z + dz) !== 2) occ = true;
          if (occ) dist[ix(x, y, z)] = 0;
        }
        for (let d = 1; d <= T; d++) {
          const nx = [];
          for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < Hh; y++) {
            if (dist[ix(x, y, z)] !== 99) continue;
            let hit = y - 1 < 0 && d === y + 1;
            for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) for (let dz = -1; dz <= 1 && !hit; dz++) {
              const X = x + dx, Y = y + dy, Z = z + dz;
              if (X >= 0 && X < 16 && Z >= 0 && Z < 16 && Y >= 0 && Y < Hh && dist[ix(X, Y, Z)] === d - 1) hit = true;
            }
            if (hit) nx.push(ix(x, y, z));
          }
          for (const i of nx) dist[i] = d;
        }
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < Hh; y++) {
          const v = m[mo(x, y, z) + 3] & 31, td = Math.min(dist[ix(x, y, z)], y + 1, T); nCells++; hist[v]++;
          if (v === 0) continue; nChk++;
          if ((td === 0 && v !== 1) || v - 1 > td) { if (!bad++) worst = (c.cx) + ',' + (c.cz) + ' @' + (x) + ',' + (y) + ',' + (z) + ' v=' + (v) + ' 真实 d=' + (td); }
        }
      }
      ck('v2: DF 不变量 v−1 ≤ 真实距离（12 区块逐格' + label + '）', bad === 0 && nChk > 0, (bad) + '/' + (nChk) + ' 违例 ' + (worst) + '；v 分布 ' + (hist.map((n, v) => n ? v + ':' + (n / nCells * 100).toFixed(1) + '%' : '').filter(Boolean).join(' ')));
      };
      dfCheck('');
      const ps0 = { p: g.player.pos.clone(), pitch: g.player.pitch, yaw: g.player.yaw, nc: g.player.noclip };
      {   // DF 开/关画面逐像素一致（参考模式：步数预算全放到最大（排除「预算耗尽」差异）+ 精确入格（排除浮点平局））
        for (let i = 0; i < 300 && VR.df.pending() > 0; i++) { VR.update(0.016); await sleep(20); }
        g.player.pos.y = 60; g.player.pitch = -0.1; await sleep(250);
        const df0 = VR.P.df; VR.setRef(1);
        g.freezeTime = true; VR.D.time = 10; VR.D.cloudX = 0; VR.resetLag();   // 冻结水波 / 云 / 摇动 / 滞后相机（同 bench）
        const grab = df => { VR.P.df = df; VR.apply('df', 'def'); VR.update(0.016); g.renderer.clear(); VR.render(); VR.render();
          const rt = VR.ddaRT, b = new Uint8Array(rt.width * rt.height * 4); g.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b); return b; };
        const a = grab(0), b = grab(1); let nd = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) nd++;
        VR.setRef(0); VR.P.df = df0; VR.apply('df', 'def'); g.freezeTime = false; VR.D.time = null; VR.D.cloudX = null;
        ck('v2: DF 开/关画面逐像素一致（参考模式 setRef：全部预算 576 + 精确入格）', nd === 0, nd + ' px 不同 / ' + (a.length / 4));
      }
      // 1 格厚墙贴天空：放置后下一帧必须挡住天空，移除后下一帧天空回来（DF 偏大 = 射线跳过新方块 = 漏天）
      const T3 = g.THREE, cam = g.camera, gl2 = g.renderer.getContext();
      const px = () => { VR.update(0.016); g.renderer.clear(); VR.render(); const rt = VR.ddaRT, b = new Uint8Array(4);
        g.renderer.readRenderTargetPixels(rt, rt.width >> 1, rt.height >> 1, 1, 1, b); return [...b]; };
      g.player.noclip = true; g.player.pos.set(g.player.pos.x, 78, g.player.pos.z); g.player.pitch = 0.08; g.player.vel.set(0, 0, 0);
      await sleep(250);
      const dir = cam.getWorldDirection(new T3.Vector3()), cp = cam.position.clone();
      const wc = cp.clone().addScaledVector(dir, 7).floor(), wall = [];
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) wall.push([wc.x + dx, wc.y + dy, wc.z + dz]);
      const sky0 = px(), same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
      for (const [x, y, z] of wall) g.setBlock(x, y, z, g.B.STONE);
      g.updateChunks(50); const on = px();
      for (const [x, y, z] of wall) g.setBlock(x, y, z, 0);
      g.updateChunks(50); const off = px();
      ck("v2: DF 放置/移除下一帧无穿帮（宿主 setBlock → 'blocks'）", !same(sky0, on) && same(sky0, off), '天空 ' + (sky0) + ' 墙 ' + (on) + ' 移除 ' + (off) + ' @' + (wc.x) + ',' + (wc.y) + ',' + (wc.z));
      {   // 同一测试走单格编辑队列（onBlockChanged → flushEdits 脏盒路径；需关树叶内部剔除，否则整块重传）
        const lc0 = VR.P.leafCullInterior; VR.P.leafCullInterior = 0; VR.apply('leafCullInterior', 'leaf'); await sleep(300);
        const setRaw = (x, y, z, id) => { const c = g.chunks.get(g.ck(x >> 4, z >> 4)); c.blocks[((x & 15) * 16 + (z & 15)) * Hh + y] = id; VR.onBlockChanged(x, y, z); };
        const e0 = R.edits, u0 = R.uploads, s1 = px();
        for (const [x, y, z] of wall) setRaw(x, y, z, g.B.STONE);
        const on2 = px(); const e1 = R.edits;
        for (const [x, y, z] of wall) setRaw(x, y, z, 0);
        const off2 = px();
        ck('v2: DF 放置/移除下一帧无穿帮（onBlockChanged → 编辑队列脏盒）', !same(s1, on2) && same(s1, off2) && e1 > e0 && R.uploads === u0,
           '天空 ' + (s1) + ' 墙 ' + (on2) + ' 移除 ' + (off2) + ' edits ' + (e0) + '→' + (R.edits) + ' uploads ' + (u0) + '→' + (R.uploads));
        for (let i = 0; i < 300 && VR.df.pending() > 0; i++) { VR.update(0.016); await sleep(20); }
        VR.P.leafCullInterior = lc0; VR.apply('leafCullInterior', 'leaf'); await sleep(300);
      }
      dfCheck('，编辑后');
      g.player.pos.copy(ps0.p); g.player.pitch = ps0.pitch; g.player.yaw = ps0.yaw; g.player.vel.set(0, 0, 0); await sleep(100);
      g.player.airMaxY = g.player.pos.y; g.player.noclip = ps0.nc;   // 悬空测试不能算成坠落伤害
    }
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
{ // §10.5-1：v2 主体只经 Env / ChunkSource 读宿主（适配器在文件尾部，不算）；waterId 只在 isFluid() 注入一次
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../v2.js', import.meta.url), 'utf8'), cut = src.indexOf('// ───────────────── VoxelCraft 适配器');
  const body = cut > 0 ? src.slice(0, cut) : src;
  const bad = [...body.matchAll(/ctx\.(skyMat|cloudMat|clouds|stars|getBlock)\b|getElementById\(['"]water['"]\)/g)].map(m => m[0]);
  const nW = (body.match(/\$\{BT\.waterId\}u/g) || []).length;
  console.log('=== v2.js 静态检查 ===');
  for (const [name, ok, info] of [['v2 主体不直接读 ctx.skyMat/cloudMat/clouds/stars/getBlock/#water', !bad.length, bad.join(',')],
                                  ['${BT.waterId}u 至多注入一次（isFluid 收口；RGBA8UI 后走 A 通道 FLUID 位 = 0 处）', nW <= 1, nW + ' 处']]) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  (' + info + ')' : ''}`); if (!ok) failed++;
  }
}
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
