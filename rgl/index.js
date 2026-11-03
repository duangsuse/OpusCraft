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
import { waterNoiseData } from '../water/noise.js';
import { createPanel } from './panel.js';
import { SurfaceField } from '../water/surfacefield.js';
import { createPassKit, u } from './pass.js';
import { vars } from './vars.js';
import { clouds } from './shaders/clouds.js';
import { skyF } from './shaders/skyf.js';
import { taa } from './shaders/taa.js';
import { bdown } from './shaders/bdown.js';
import { bup } from './shaders/bup.js';
import { final } from './shaders/final.js';
import { comp } from './shaders/comp.js';
import { shadow } from './shaders/shadow.js';
import { fancy } from './shaders/fancy.js';
import { water } from './shaders/water.js';
import { commonX } from './shaders/common.js';
import { depthOut } from './shaders/depthout.js';
import { entComp } from './shaders/entcomp.js';
import { setFrame, F as FH } from './frameref.js';
import { createEntityLight } from './entlight.js';
import { createBlobShadows } from './blobshadow.js';
import { skyLut } from './shaders/skylut.js';
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

const NO_WEATHER = { rain: 0, thunder: 0, wet: 0 };

export function createRenderer(ctx) {
  const { renderer, camera, THREE } = ctx;
  const gl = renderer.getContext();
  // 子类只为了记下每个 program 的源码（fsdump / programs）；编译和链接失败 mk() 自己会抛异常 → 宿主回落 v1
  class GL extends Renderer { mk(name, vs, fs) { (this.src ||= {})[name] = { vs, fs, defines: {} }; super.mk(name, vs, fs); } }
  const R = new GL(renderer.domElement);
  if (!R.floatOK) throw new Error('gl: 需要 EXT_color_buffer_float');

  // R5：模板化 Pass（rgl/pass.js）。已转的 program 放进 R.passes，vendor 的 renderFancy 里对应的 use / 上传行已被补丁替换；其余仍走 R.mk / R.use
  const DEV = /[?&]passdev\b/.test(location.search), kit = createPassKit(gl, { dev: DEV }); let warnedSun = false;
  const tex = (t, type = 'sampler2D') => Object.assign(t, { glslType: type });   // 纹理的 GLSL 类型打在对象上（vars.js glslTypeOf 读它）
  const T = () => R.targets;
  const dr = { offset: new Float32Array(3), origin: new Float32Array(3) };
  R.setDraw = (P, ox, oy, oz, ax, ay, az) => { dr.offset[0] = ox; dr.offset[1] = oy; dr.offset[2] = oz; dr.origin[0] = ax; dr.origin[1] = ay; dr.origin[2] = az; P.touch('offset', 'origin'); };
  const SRC = voxelCraftSource(ctx), ENV = voxelCraftEnv(ctx), BT = voxelCraftBlocks(ctx);
  // 岸线 / 水面高度场（water/surfacefield.js）：环形 RG8UI，按世界格取模；N = 512 够 rd ≤ 14。区块事件驱动（'blocks' 重写该区块 16×16、'gone' 清掉）
  const field = new SurfaceField({ N: 512, H: SRC.height, waterId: BT.waterId, solid: Uint8Array.from(BT.kind, k => k === 1 ? 1 : 0) });
  const fieldTex = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8UI, field.N, field.N, 0, gl.RG_INTEGER, gl.UNSIGNED_BYTE, field.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.bindTexture(gl.TEXTURE_2D, null); return t; })();
  SRC.onChunkChanged((cx, cz, what) => { if (what === 'gone') field.clearChunk(cx, cz); else if (what === 'blocks') { const ch = SRC.getChunk(cx, cz); if (ch) field.setChunk(cx, cz, ch.blocks); } });
  SRC.forEachChunk((cx, cz) => { const ch = SRC.getChunk(cx, cz); if (ch) field.setChunk(cx, cz, ch.blocks); });
  function uploadField() {
    const d = field.takeDirty(); if (!d.length) return;
    gl.bindTexture(gl.TEXTURE_2D, fieldTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const [cx, cz] of d) { const r = field.chunkRect(cx, cz); gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, 16, 16, gl.RG_INTEGER, gl.UNSIGNED_BYTE, r.data); }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  const wnoise = (() => { const { N, data } = waterNoiseData(), t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.REPEAT], [gl.TEXTURE_WRAP_T, gl.REPEAT], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindTexture(gl.TEXTURE_2D, null); return t; })();   // v2/gl 同一张水面噪声（water/noise.js）
  const X = {
    wnoise: u('wnoise', () => tex(wnoise)),
    shoreFld: u('shoreFld', () => tex(fieldTex, 'usampler2D')), shoreN: u('shoreN', Object.assign(() => field.N, { meta: { glsl: 'int' } })),
    skyLut: u('skyLut', () => tex(R.lutTex)),
    taaCur: u('curTex', () => tex(T().compC)), taaHist: u('histTex', () => tex(T().histC[1 - T().histI])), taaDepth: u('depthTex', () => tex(T().sceneD)), histValid: () => T().histValid,
    blSrc: u('src', () => tex(R.bl.src)), blTexel: u('texel', () => [1 / R.bl.w, 1 / R.bl.h]), blFirst: u('first', () => R.bl.first),   // 当前 bloom 层（vendor 的循环在调用 use() 前写 R.bl）
    cColor: u('color', () => tex(T().sceneC)), cDepth: u('depth', () => tex(T().sceneD)), cShadow: u('shadow', () => tex(R.shadowTex, 'sampler2DShadow')), cClouds: u('clouds', () => tex(T().cloudC)), cGbuf: u('gbuf', () => tex(T().gbufC)),
    atlas: u('tex', () => tex(R.tex, 'sampler2DArray')), offset: u('offset', () => dr.offset), origin: u('origin', () => dr.origin),   // 每次 draw 都变的量（见 R.setDraw）
    finalSrc: u('src', () => tex(T().compC)), finalBloom: u('bloom', () => tex(T().bloom[0].t)),
  };
  Object.assign(X, commonX(R, tex, T));
  R.passes = { skyLut: skyLut(kit.Pass), clouds: clouds(kit.Pass, X), skyF: skyF(kit.Pass, X), taa: taa(kit.Pass, X), bdown: bdown(kit.Pass, X), bup: bup(kit.Pass, X), final: final(kit.Pass, X), comp: comp(kit.Pass, X), shadow: shadow(kit.Pass, X), shadowS: shadow(kit.Pass, X, true), fancy: fancy(kit.Pass, X), water: water(kit.Pass, X) };
  // 适配器（宿主 A）：ChunkSource / Env / BlockTable。R2 只用 Env 的 dayTime
  // 贴图 / PBR：用 goodGL 自己的程序化贴图（材质参数和贴图是一起调出来的，render.md §3 贴图行）
  const tx = Textures.build(); R.uploadTextures(tx); R.uploadPBR(PBR.build(tx), tx.count);
  // R4 方案 B：goodGL 画完（final 之后）把它的深度换算成 three 相机的深度写进默认帧缓冲，three 再直接画 scene（实体、粒子、选框）
  //   goodGL 的 near / far 与宿主相机的不同 → 先还原线性视深再按宿主投影重新映射。实体不走 tonemap / TAA（方案 A 才走）。
  const sceneDepth = u('sceneDepth', () => tex(R.targets.sceneD));
  R.passes.depthOut = depthOut(kit.Pass, { sceneDepth, hostNear: u('hostNear', () => camera.near), hostFar: u('hostFar', () => camera.far) });
  // 方案 A：宿主实体画进离屏目标（RGBA16F + 深度纹理），scene pass 里 drawEntities 之后合并（vendor 补丁 onEntities）；P.entScene = false 回到方案 B
  let entRT = null;
  const entTex = t => ({ texture: renderer.properties.get(t).__webglTexture, glslType: 'sampler2D' });
  R.passes.entComp = entComp(kit.Pass, { entColor: u('entColor', () => entTex(entRT.texture)), entDepth: u('entDepth', () => entTex(entRT.depthTexture)), hostNear: u('hostNear', () => camera.near), hostFar: u('hostFar', () => camera.far) });
  function ensureEntRT(w, h) {
    if (entRT && entRT.width === w && entRT.height === h) return;
    if (entRT) { entRT.depthTexture.dispose(); entRT.dispose(); }
    entRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
  }
  const clearCol = new THREE.Color();
  R.onEntities = F => {
    if (!P.entScene) return;
    hideSky(); ensureEntRT(F.w, F.h);
    renderer.resetState();
    const ca = renderer.getClearAlpha(); renderer.getClearColor(clearCol);
    renderer.setRenderTarget(entRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(ctx.scene, camera);                                           // 未抖动的宿主相机：实体不走 TAA 历史，抖动只会让它们闪
    renderer.setRenderTarget(null); renderer.setClearColor(clearCol, ca); renderer.resetState();
    resetGLState(gl);                                                             // three 动过的状态全部还给 goodGL，再合并
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.targets.scene); gl.viewport(0, 0, F.w, F.h);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);     // 预乘 alpha；dst alpha 不动
    R.passes.entComp.use();
    gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE);
  };
  const hideSky = () => { for (const k of ['sky', 'sun', 'moon', 'stars', 'clouds']) if (ctx[k]) ctx[k].visible = false; };
  const world = createWorld(R, SRC, idLUT(ctx.B), { seed: 1 });

  // 参数：只列已经接上的。fog / mist 默认 0 = 去雾版（render.md §0，goodGL 的缺点之一）；scale / maxMP 等 R5 接上 pass.js / vars.js 后再加
  const P_DEFAULTS = { rd: 0 /* 0 = 取宿主设置 */, waving: true, clouds: true, gamma: 0.5, volumetric: true, shadowQ: 2, pbr: true, pom: true, taa: true, flare: true, sharpDist: 98 /* 锐阴影（花草）walk 时的范围；0 = 关 */, sharpSoft: 0.8 /* 锐阴影边缘柔化半径（texel）：0 = 单 tap */, sharpFly: 0 /* fly / noclip 时的范围；0 = 整个锐图 pass 不画 */, fog: 0, mist: 0, ssrSteps: 24 /* 水面屏幕空间反射步数（0 = 只反射天空） */, uwCaustic: 1.4 /* 水下表面焦散强度（v2/gl 图样） */, uwShafts: 1 /* 水下光束强度 */, uwDensity: 1 /* 水体消光 / 散射倍率 */, uwWindow: 4 /* 水下仰视 Snell 窗口 / 全反射的起始深度（格）；更浅时按带扭曲的透视看水面上方 */, foamWidth: 1.2 /* 岸边波纹范围（格） */, shoreFade: 0.3 /* 岸边软化（竖直水深格） */, shoreWaveAmp: 0.12 /* 岸边涌浪起伏（格） */, shoreWaveSpeed: 1, meshJobs: 6 /* 每帧最多提交的网格任务 */, blobShadow: 0.5 /* 实体脚下软影浓度（0 = 关） */, entExposure: 1 /* 实体（生物 / 掉落物 / TNT）亮度倍率；颜色已按场景光照折算，这里只做整体偏移 */, entScene: true /* 实体进 goodGL 场景（雾 / 云 / tonemap 一致）；关 = 方案 B：final 之后叠画 */ };
  // P = vars 对象（读写值照旧，bench 契约不变）；meta.folder 给面板分文件夹：雾、云隙光各一组（render.md 备忘「天空 / 雾 / 云隙光」），面板本身 R7 才建
  const FOLDER = (f, o = {}) => ({ folder: f, ...o });
  const P = vars(P_DEFAULTS, {
    rd: FOLDER('渲染', { min: 0, max: 16, step: 1, label: '视距（0 = 取宿主）' }), waving: FOLDER('渲染'), clouds: FOLDER('渲染'), gamma: FOLDER('渲染', { min: 0, max: 1 }), shadowQ: FOLDER('渲染', { min: 1, max: 2, step: 1 }),
    pbr: FOLDER('渲染'), pom: FOLDER('渲染'), taa: FOLDER('渲染'), flare: FOLDER('渲染'),
    mist: FOLDER('雾', { min: 0, max: 1, label: '晨昏薄雾' }), fog: FOLDER('雾', { min: 0, max: 0.02, label: '距离雾密度' }),
    volumetric: FOLDER('云隙光', { label: '体积光（云隙光 / 雾中光束）' }),
    sharpDist: FOLDER('花草锐阴影', { min: 0, max: 128 }), sharpSoft: FOLDER('花草锐阴影', { min: 0, max: 3 }), sharpFly: FOLDER('花草锐阴影', { min: 0, max: 128 }), blobShadow: FOLDER('实体', { min: 0, max: 0.8 }), entScene: FOLDER('实体'), entExposure: FOLDER('实体', { min: 0.3, max: 3, step: 0.05 }),
    uwWindow: FOLDER('水下', { min: 0, max: 16, label: '窗口起始深度（格）' }), uwCaustic: FOLDER('水下', { min: 0, max: 4, label: '焦散' }), uwShafts: FOLDER('水下', { min: 0, max: 4, label: '光束' }), uwDensity: FOLDER('水下', { min: 0.2, max: 4, label: '水体浓度' }),
    foamWidth: FOLDER('水', { min: 0, max: 1.5, label: '岸边波纹范围' }), shoreFade: FOLDER('水', { min: 0, max: 1.5, label: '岸边软化' }), shoreWaveAmp: FOLDER('水', { min: 0, max: 0.3, label: '岸边涌浪起伏' }), shoreWaveSpeed: FOLDER('水', { min: 0, max: 3, label: '岸边涌浪速度' }),
    ssrSteps: FOLDER('水', { min: 0, max: 48, step: 1, label: '反射步数（SSR）' }),
    meshJobs: FOLDER('调试', { min: 1, max: 16, step: 1 }),
  });
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
  const blobs = !('shadowCasters' in ctx) ? null : createBlobShadows(THREE, ctx.scene, {
    casters: () => ctx.shadowCasters, getF: () => (nFrames ? FH : null), strength: () => P.blobShadow,
    groundY: (x, y, z) => { const ix = Math.floor(x), iz = Math.floor(z); for (let k = Math.floor(y + 0.5), lo = Math.max(0, k - 8); k >= lo; k--) if (ctx.SOLID[ctx.getBlock(ix, k, iz)]) return k + 1; return null; },
  });
  function drawThree(F) {
    hideSky();
    if (P.entScene) { renderer.resetState(); return; }                            // 方案 A：实体已经在 scene 里（R.onEntities）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, F.w, F.h);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    R.passes.depthOut.use();
    gl.bindVertexArray(R.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true); gl.depthFunc(gl.LEQUAL);
    renderer.resetState();
    renderer.render(ctx.scene, camera);                                          // autoClear 已关：叠在 final 的画面上，按深度被地形遮挡
  }
  function render() {
    const t0 = performance.now(); const dt = lastT ? Math.min(250, t0 - lastT) : 16.7; lastT = t0;
    renderer.getDrawingBufferSize(v2); W = v2.x | 0; H = v2.y | 0;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;                                    // 列主序：第 4 列位置，第 3 列 = −前，第 2 列 = 上
    const rd = P.rd || (ctx.settings && ctx.settings.rd) || 6;
    const day = ENV.dayTime != null ? ENV.dayTime : 0.02;                      // Env.dayTime：0..1，0 = 06:00 = goodGL 的 tick 0
    const sec = performance.now() / 1000;
    const wx = ENV.weather || NO_WEATHER;                                       // 宿主 A 没有天气 = 恒晴
    if (ENV.underwater) ENV.underwater(!!ENV.eyeInWater);                       // 宿主的水下遮罩由着色器代替（每帧隐藏）
    const sharpT = ENV.flying ? P.sharpFly : P.sharpDist; sharpNow = Math.abs(sharpT - sharpNow) < 0.5 ? sharpT : sharpNow + (sharpT - sharpNow) * Math.min(1, dt / 300);
    const F = fb.build({ W, H, eye: [e[12], e[13], e[14]], fwd: [-e[8], -e[9], -e[10]], up: [e[4], e[5], e[6]], fovDeg: camera.fov, rd,
      tick: day * 24000, dayCount: 0, underwater: ENV.eyeInWater, eyeSky: ENV.eyeSky, waterTop: ENV.eyeWaterTop, rain: wx.rain, flash: wx.thunder, wet: wx.wet, time: D.time != null ? D.time : sec, cloudTime: D.cloudX != null ? D.cloudX : sec, dt, ref: D.ref,
      S: { ...P, sharpDist: sharpNow }, dbg: { fog: P.fog, mist: P.mist } });
    setFrame(F);
    uploadField();
    if (DEV && ENV.sunDir) { const s = ENV.sunDir, d = Math.hypot(s.x - F.sunDir[0], s.y - F.sunDir[1], s.z - F.sunDir[2]); if (d > 2e-3 && !warnedSun) { warnedSun = true; console.warn('rgl: 宿主 Env.sunDir 与 goodGL celestial 不一致（日月轨迹必须同源）', d, [s.x, s.y, s.z], F.sunDir); } }
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
    if (blobs) blobs.update();                                                  // 要在 renderFancy 之前：方案 A 的实体在 renderFancy 里（onEntities）画
    try { R.renderFancy(F); drawThree(F); }
    finally {
      if (timed) { delete gl.bindFramebuffer; if (qActive) { gl.endQuery(qExt.TIME_ELAPSED_EXT); qActive = false; } qSet = qCur; }
      renderer.resetState();                                                   // three 的状态缓存失效 → 重新同步
    }
    cpuMs = performance.now() - t0; nFrames++;
  }

  const panel = createPanel(P, { defaults: P_DEFAULTS });
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
    P, P_DEFAULTS, paneReady: panel.paneReady, togglePanel: panel.togglePanel, panelVisible: panel.panelVisible, panelSpec: [], get panelRows() { return P.panelSpec; }, apply: k => { P.it[k].set(P[k]); }, presets: { cloud: {}, water: {} }, D,
    setRef: on => { D.ref = on ? 1 : 0; },
    setDebug: (view = 0, raw = 0) => { D.view = view; D.raw = raw; },          // R2：DBG 宏还没接（bench.md §5），只记下
    resetLag: () => { fb.reset(); },
    get perf() { return { gpu: { ...gpu }, gpuLast: { ...gpuLast }, hasTimer: !!qExt, cpuMs, passes: PASSES, scale: 1, ddaW: W, ddaH: H }; },
    // 最终画面（HUD 之前）从默认帧缓冲读回；调用方要在 render() 的同一个任务里读（drawing buffer 不保留）
    readOut: () => { const px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w: W, h: H, px }; },
    get programs() { const o = { ...R.src }; for (const [k, p] of Object.entries(R.passes)) { const x = p.source(); o[k] = { vs: x.vs, fs: x.fs, defines: {} }; } return o; },
    pending: () => world.pending(),
    entityLight: createEntityLight(() => (nFrames ? FH : null), { scene: () => P.entScene, gain: () => P.entExposure }),                 // 宿主 lightColor() 的钩子：实体在 final 之后画，光照走 CPU（entlight.js）
    source: SRC, blockTable: BT, env: ENV, R, world,
  };
}
