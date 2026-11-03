// ?r=gl —— goodGL 渲染管线（vendor/gl，tools/vendor.mjs 抽取）接进宿主：createRenderer(RCTX) → bench 契约（goal-remix/bench.md §2）
//   R2：空帧（天空、云、体积光、bloom、色调映射）。R3：宿主 A 的区块（padded → Worker 网格化 → 段缓冲 → 视锥剔除）+ goodGL 自己的贴图和 PBR。
//   还没有：实体、手、天气粒子（R4）；宿主的 three 场景在 ?r=gl 下完全不画。
//   共享 three 的 WebGL 上下文：`new Renderer(canvas)` 里的 getContext('webgl2', …) 对已建好的画布返回同一个上下文（参数被忽略）。
//   goodGL 画完后调 `renderer.resetState()` 让 three 重新同步状态缓存，宿主随后用 three 画 HUD（VoxelCraft.html 的主循环不用改）。
import { Renderer } from '../vendor/gl/renderer.js';
import { Textures } from '../vendor/gl/textures.js';
import { PBR } from '../vendor/gl/pbr.js';
import { createFrameBuilder } from './frame.js';
import { idLUT } from './xlate.js';
import { createWorld } from './world.js';
import { voxelCraftSource, voxelCraftEnv, voxelCraftBlocks } from '../v2/gl.js';   // 宿主 A 的三个适配器，直接 import 不复制（bench.md §1）

// 分 pass 计时的名字（render.md §1 的 pass 表）。goodGL 没有逐 pass 的钩子：按「绑定到哪个 FBO」切段（见 timeFrame）
const PASSES = ['lut', 'shadow', 'scene', 'water', 'cloud', 'comp', 'taa', 'bloom', 'final'];

// goodGL 假定拿到的是一个干净的上下文（render.md §5）：每帧开头显式设一遍它依赖的状态，three 留下什么都不要紧
function resetGLState(gl) {
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const c of [gl.SCISSOR_TEST, gl.STENCIL_TEST, gl.BLEND, gl.POLYGON_OFFSET_FILL, gl.SAMPLE_ALPHA_TO_COVERAGE, gl.DITHER]) gl.disable(c);
  gl.colorMask(true, true, true, true); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
  gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ZERO);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.activeTexture(gl.TEXTURE0);
}

export function createRenderer(ctx) {
  const { renderer, camera, THREE } = ctx;
  const gl = renderer.getContext();
  // 子类只为了记下每个 program 的源码（fsdump / programs）；编译和链接失败 mk() 自己会抛异常 → 宿主回落 v1
  class GL extends Renderer { mk(name, vs, fs) { (this.src ||= {})[name] = { vs, fs, defines: {} }; super.mk(name, vs, fs); } }
  const R = new GL(renderer.domElement);
  if (!R.floatOK) throw new Error('gl: 需要 EXT_color_buffer_float');

  // 适配器（宿主 A）：ChunkSource / Env / BlockTable。R2 只用 Env 的 dayTime
  const SRC = voxelCraftSource(ctx), ENV = voxelCraftEnv(ctx), BT = voxelCraftBlocks(ctx);
  // 贴图 / PBR：用 goodGL 自己的程序化贴图（材质参数和贴图是一起调出来的，render.md §3 贴图行）
  const tx = Textures.build(); R.uploadTextures(tx); R.uploadPBR(PBR.build(tx), tx.count);
  const world = createWorld(R, SRC, idLUT(ctx.B), { seed: 1 });

  // 参数：只列已经接上的。fog / mist 默认 0 = 去雾版（render.md §0，goodGL 的缺点之一）；scale / maxMP 等 R5 接上 pass.js / vars.js 后再加
  const P_DEFAULTS = { rd: 0 /* 0 = 取宿主设置 */, waving: true, clouds: true, gamma: 0.5, volumetric: true, shadowQ: 2, pbr: true, pom: true, taa: true, flare: true, sharpDist: 98 /* 锐阴影（花草）walk 时的范围；0 = 关 */, sharpSoft: 0.8 /* 锐阴影边缘柔化半径（texel）：0 = 单 tap */, sharpFly: 0 /* fly / noclip 时的范围；0 = 整个锐图 pass 不画 */, fog: 0, mist: 0, meshJobs: 6 /* 每帧最多提交的网格任务 */ };
  const P = { ...P_DEFAULTS };
  // D：bench / 调试钉点（bench.md §2、§4）。time 钉住 F.time（火把闪烁、水波相位），cloudX 钉住 cloudTime，ref = REF 模式，noTimer 关计时查询
  const D = { view: 0, raw: 0, time: null, cloudX: null, ref: 0, noTimer: 0 };
  const fb = createFrameBuilder();
  let sharpNow = P.sharpDist;                                                    // 花草锐阴影 LOD：walk / fly 之间按 ~0.3 s 缓动，不跳变

  // ---- 分 pass 计时：EXT_disjoint_timer_query_webgl2，同 v2/gl.js 的 gpuPass / gpuPoll，只是切段方式不同
  //      renderFancy 里每个 pass 开头都 bindFramebuffer(FRAMEBUFFER, 自己的目标)：render 期间临时包一层，按目标 FBO 切段。
  //      复制用的 READ / DRAW_FRAMEBUFFER 绑定不算。TAA 之后回写 comp、手都归到 comp / taa 里，只作参考（裁决看墙钟，bench.md §6）
  const qExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = Object.fromEntries([...PASSES, 'total'].map(k => [k, 0])), gpuLast = { ...gpu, frame: 0 };
  const qPool = []; let qSet = null, qCur = null, qActive = false, gpuFrames = 0;
  function passOf(f) {
    const T = R.targets;
    if (f === null) return 'final';
    if (f === R.lutFBO) return 'lut';
    if (f === R.shadowFBO || f === R.sharpFBO) return 'shadow';
    if (f === T.cloud) return 'cloud';
    if (f === T.comp) return 'comp';
    if (T.hist.includes(f)) return 'taa';
    if (T.bloom.some(b => b.f === f)) return 'bloom';
    if (f === T.scene) return qCur.some(x => x.name === 'scene') ? 'water' : 'scene';   // 复制深度 / 颜色之后再绑 scene = 水和半透明
    return null;
  }
  function qBegin(name) {
    if (qActive) gl.endQuery(qExt.TIME_ELAPSED_EXT);
    const q = qPool.pop() || gl.createQuery(); qCur.push({ name, q }); gl.beginQuery(qExt.TIME_ELAPSED_EXT, q); qActive = true;
  }
  function gpuPoll() {
    if (!qExt || !qSet) return;
    if (!qSet.every(x => gl.getQueryParameter(x.q, gl.QUERY_RESULT_AVAILABLE))) return;
    const disjoint = gl.getParameter(qExt.GPU_DISJOINT_EXT), ms = Object.fromEntries(PASSES.map(k => [k, 0]));
    for (const x of qSet) ms[x.name] += (gl.getQueryParameter(x.q, gl.QUERY_RESULT) || 0) / 1e6;
    qPool.push(...qSet.map(x => x.q)); qSet = null;
    if (disjoint) return;
    let tot = 0; for (const k of PASSES) { gpuLast[k] = ms[k]; tot += ms[k]; gpu[k] = gpuFrames ? gpu[k] * 0.85 + ms[k] * 0.15 : ms[k]; }
    gpuLast.total = tot; gpuLast.frame = ++gpuFrames; gpu.total = PASSES.reduce((a, k) => a + gpu[k], 0);
  }

  let W = 0, H = 0, cpuMs = 0, lastT = 0, nFrames = 0;
  const v2 = new THREE.Vector2();
  function render() {
    const t0 = performance.now(); const dt = lastT ? Math.min(250, t0 - lastT) : 16.7; lastT = t0;
    renderer.getDrawingBufferSize(v2); W = v2.x | 0; H = v2.y | 0;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;                                    // 列主序：第 4 列位置，第 3 列 = −前，第 2 列 = 上
    const rd = P.rd || (ctx.settings && ctx.settings.rd) || 6;
    const day = ENV.dayTime != null ? ENV.dayTime : 0.02;                      // Env.dayTime：0..1，0 = 06:00 = goodGL 的 tick 0
    const sec = performance.now() / 1000;
    const sharpT = ENV.flying ? P.sharpFly : P.sharpDist; sharpNow = Math.abs(sharpT - sharpNow) < 0.5 ? sharpT : sharpNow + (sharpT - sharpNow) * Math.min(1, dt / 300);
    const F = fb.build({ W, H, eye: [e[12], e[13], e[14]], fwd: [-e[8], -e[9], -e[10]], up: [e[4], e[5], e[6]], fovDeg: camera.fov, rd,
      tick: day * 24000, dayCount: 0, time: D.time != null ? D.time : sec, cloudTime: D.cloudX != null ? D.cloudX : sec, dt, ref: D.ref,
      S: { ...P, sharpDist: sharpNow }, dbg: { fog: P.fog, mist: P.mist } });
    resetGLState(gl);
    R.ensureTargets(W, H);
    world.pump(e[12], e[13], e[14], rd, P.meshJobs);
    R.cull(F, world, rd);                                                       // F.all / F.visible（remix: frame.js 里先置空）
    if (qExt && !D.noTimer) gpuPoll();
    const timed = !!qExt && !D.noTimer && !qSet, bf = gl.bindFramebuffer;   // 上一组还没读到结果就不开始新的一组（GPU 结果晚一两帧才可用），和 v2/gl 一样隔帧采样
    if (timed) {
      qCur = []; qActive = false;
      gl.bindFramebuffer = function (target, f) {                              // 只在这一帧内包一层，之后删掉（恢复原型方法）
        bf.call(gl, target, f);
        if (target === gl.FRAMEBUFFER) { const n = passOf(f); if (n && (!qCur.length || qCur[qCur.length - 1].name !== n)) qBegin(n); }
      };
    }
    try { R.renderFancy(F); }
    finally {
      if (timed) { delete gl.bindFramebuffer; if (qActive) { gl.endQuery(qExt.TIME_ELAPSED_EXT); qActive = false; } qSet = qCur; }
      renderer.resetState();                                                   // three 的状态缓存失效 → 重新同步
    }
    cpuMs = performance.now() - t0; nFrames++;
  }

  return {
    name: 'gl',
    // ChunkSource 事件源：宿主的 build / dispose 就是它（R3 起据此标脏段）
    buildChunk: c => { c.mesh = c.waterMesh = null; if (SRC.built) SRC.built(c); },
    disposeChunk: c => { if (SRC.disposed) SRC.disposed(c); c.mesh = c.waterMesh = null; },
    update: dt => {},     // 网格任务在 render() 里按相机位置提交
    render,
    stats: () => { const w = world.stat(); return `gl ${W}x${H} 区块 ${w.chunks} 段 ${R.stats.drawn}/${R.stats.sections} 网格 ${w.meshN}×${w.meshMsAvg.toFixed(1)}ms ${w.quads}q cpu ${cpuMs.toFixed(1)}ms` +
      (qExt ? ` gpu ${PASSES.map(k => k.slice(0, 2) + gpu[k].toFixed(1)).join('/')} = ${gpu.total.toFixed(1)}ms` : '') + (D.view ? ` [dbg ${D.view}]` : ''); },
    // ---- bench 契约（bench.md §2）
    P, P_DEFAULTS, panelSpec: [], apply: () => {}, presets: { cloud: {}, water: {} }, D,
    setRef: on => { D.ref = on ? 1 : 0; },
    setDebug: (view = 0, raw = 0) => { D.view = view; D.raw = raw; },          // R2：DBG 宏还没接（bench.md §5），只记下
    resetLag: () => { fb.reset(); },
    get perf() { return { gpu: { ...gpu }, gpuLast: { ...gpuLast }, hasTimer: !!qExt, cpuMs, passes: PASSES, scale: 1, ddaW: W, ddaH: H }; },
    // 最终画面（HUD 之前）从默认帧缓冲读回；调用方要在 render() 的同一个任务里读（drawing buffer 不保留）
    readOut: () => { const px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w: W, h: H, px }; },
    get programs() { return R.src; },
    pending: () => world.pending(),
    source: SRC, blockTable: BT, env: ENV, R, world,
  };
}
