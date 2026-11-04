// ?r=gl —— goodGL 渲染管线（vendor/gl，tools/vendor.mjs 抽取）接进宿主：createRenderer(RCTX) → bench 契约（goal-remix/bench.md §2）
//   R2：空帧（天空、云、体积光、bloom、色调映射）。R3：宿主 A 的区块（padded → Worker 网格化 → 段缓冲 → 视锥剔除）+ goodGL 自己的贴图和 PBR。
//   还没有：实体、手、天气粒子（R4）；宿主的 three 场景在 ?r=gl 下完全不画。
//   共享 three 的 WebGL 上下文：`new Renderer(canvas)` 里的 getContext('webgl2', …) 对已建好的画布返回同一个上下文（参数被忽略）。
//   goodGL 画完后调 `renderer.resetState()` 让 three 重新同步状态缓存，宿主随后用 three 画 HUD（VoxelCraft.html 的主循环不用改）。
import { Renderer } from '../vendor/gl/renderer.js';
import { Textures } from '../vendor/gl/textures.js';
import { PBR } from '../vendor/gl/pbr.js';
import { createFrameBuilder } from './frame.js';
import { createPanel } from './panel.js';
import { createPassKit, named, setFrame, Fpv } from './pass.js';
import { vars } from './vars.js';
import { idLUT, createWorld, shadow, commonX } from './terrain.js';
import { skyLut, skyF, clouds } from './long/sky.js';
import { taa, bdown, bup, final, depthOut } from './post.js';
import { createEntityLight, createBlobShadows, entComp } from './entity.js';
import { fancy } from './long/fancy.js';
import { createFireFx } from './fire.js';
import { createRipples } from './ripple.js';
import { water } from './long/water.js';
import { comp } from './long/comp.js';
import { waterNoiseData } from '../water/noise.js';
import { SurfaceField } from '../water/surfacefield.js';
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
  const dr = { offset: new Float32Array(3), origin: new Float32Array(3), fade: 1 };
  // 新网格段的出现动画：每帧 R.cull 之后按段登记 { 下沉量, 淡入度 }（rises），setDraw 按段原点（16 的倍数）查表。
  //   只改 offset（几何下沉），origin 不动 → v_world / 噪声 / 阴影采样位置不变，不闪；阴影图 pass 不下沉（接收端用的是真实位置）。
  //   手 / 动态网格的 setDraw 原点不是 16 的倍数，或 offset 全 0，不会命中。
  const rises = new Map(), rkey = (x, y, z) => (((x >> 4) + 4096) * 8192 + ((z >> 4) + 4096)) * 64 + (y >> 4);
  R.setDraw = (P, ox, oy, oz, ax, ay, az) => {
    let rise = 0, fade = 1;
    if (rises.size && P.tag !== 'shadow' && P.tag !== 'shadowS' && (ox || oy || oz) && ax % 16 === 0 && ay % 16 === 0 && az % 16 === 0) { const r = rises.get(rkey(ax, ay, az)); if (r) { rise = r[0]; fade = r[1]; } }
    dr.offset[0] = ox; dr.offset[1] = oy - rise; dr.offset[2] = oz; dr.origin[0] = ax; dr.origin[1] = ay; dr.origin[2] = az; dr.fade = fade; P.touch('offset', 'origin', 'apFade');
  };
  const SRC = ctx.source || voxelCraftSource(ctx), ENV = ctx.env || voxelCraftEnv(ctx), BT = ctx.blockTable || voxelCraftBlocks(ctx);   // 宿主 B 自带三个适配器（rgl/host-b.js）
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
  const X = named({
    wnoise: () => tex(wnoise),
    shoreFld: () => tex(fieldTex, 'usampler2D'), shoreN: Object.assign(() => field.N, { meta: { glsl: 'int' } }),
    skyLut: () => tex(R.lutTex),
    taaCur: () => tex(T().compC), taaHist: () => tex(T().histC[1 - T().histI]), taaDepth: () => tex(T().sceneD),
    blSrc: () => tex(R.bl.src), blTexel: () => [1 / R.bl.w, 1 / R.bl.h], blFirst: () => R.bl.first,   // 当前 bloom 层（vendor 的循环在调用 use() 前写 R.bl）
    cColor: () => tex(T().sceneC), cDepth: () => tex(T().sceneD), cShadow: () => tex(R.shadowTex, 'sampler2DShadow'), cClouds: () => tex(T().cloudC), cGbuf: () => tex(T().gbufC),
    atlas: () => tex(R.tex, 'sampler2DArray'), offset: () => dr.offset, origin: () => dr.origin, apFade: () => dr.fade,   // 每次 draw 都变的量（见 R.setDraw）
    finalSrc: () => tex(T().compC), finalBloom: () => tex(T().bloom[0].t),
  });
  X.histValid = () => T().histValid;                                             // JS 里调用（taa 的 reset），不是 uniform
  Object.assign(X, commonX(R, tex, T));
  // 水面波纹高度场（rgl/ripple.js）：必须在 water pass 建好之前有 X.rip；sim 读岸线场 fieldTex 当边界遮罩
  const ripples = createRipples(gl, R, kit, { tex, X, field, restore: () => resetGLState(gl) });
  // 水体模拟更新水位 → 高度场扰动：宿主 B 的 blockChanged（含流体 tick 与「破坏海边方块 → 水涌入」）带新旧 id / meta；水格高度 = strength / 9
  //   （源 / 下落 = 8，流动 = 8 − meta，同 mobsim Fluids.strength）。水位升 → 正脉冲，降 → 负脉冲；水涌入空出来的格（Δ ≈ 0.89）= 一次涌浪。宿主 A 不发这个回调
  const wlv = (id, meta) => id !== BT.waterId ? 0 : (meta === 0 || meta >= 8 ? 8 : 8 - meta) / 9;
  if (SRC.onBlockChanged && ripples.on) SRC.onBlockChanged((x, y, z, info) => {
    if (!info) return; const d = wlv(info.id, info.meta) - wlv(info.oldId, info.oldMeta);
    if (Math.abs(d) > 0.05) ripples.disturb(x + 0.5, z + 0.5, Math.max(-0.4, Math.min(0.4, d * P.rippleSurge)), 0.6 + Math.abs(d) * 0.6, y);
  });
  Object.assign(X, named({ rip: () => tex(ripples.tex() || wnoise) }));
  R.passes = { skyLut: skyLut(kit.Pass), clouds: clouds(kit.Pass, X), skyF: skyF(kit.Pass, X), taa: taa(kit.Pass, X), bdown: bdown(kit.Pass, X), bup: bup(kit.Pass, X), final: final(kit.Pass, X), comp: comp(kit.Pass, X), shadow: shadow(kit.Pass, X), shadowS: shadow(kit.Pass, X, true), fancy: fancy(kit.Pass, X), water: water(kit.Pass, X) };
  // 适配器（宿主 A）：ChunkSource / Env / BlockTable。R2 只用 Env 的 dayTime
  // 贴图 / PBR：用 goodGL 自己的程序化贴图（材质参数和贴图是一起调出来的，render.md §3 贴图行）
  resetGLState(gl);                                                              // three 先用过这个上下文（宿主 B 的图集是 FLIP_Y 之类）：上传前把 UNPACK 状态还原，否则 texSubImage3D 报 INVALID_OPERATION、贴图全黑
  // 宿主可以给 ctx.texturePack(tx)：按名字把资源包的贴图覆盖进 tx.data / tx.imgs（rgl/host-b.js glsPack）；之后换包走 reloadTextures()
  const loadTextures = () => {
    const tx = Textures.build(); if (ctx.texturePack) ctx.texturePack(tx);
    for (const k of ['tex', 'nrmTex', 'specTex']) if (R[k]) { gl.deleteTexture(R[k]); R[k] = null; }
    R.uploadTextures(tx); R.uploadPBR(PBR.build(tx), tx.count);
  };
  loadTextures();
  // R4 方案 B：goodGL 画完（final 之后）把它的深度换算成 three 相机的深度写进默认帧缓冲，three 再直接画 scene（实体、粒子、选框）
  //   goodGL 的 near / far 与宿主相机的不同 → 先还原线性视深再按宿主投影重新映射。实体不走 tonemap / TAA（方案 A 才走）。
    R.passes.depthOut = depthOut(kit.Pass, named({ sceneDepth: () => tex(R.targets.sceneD), hostNear: () => camera.near, hostFar: () => camera.far }));
  // 方案 A：宿主实体画进离屏目标（RGBA16F + 深度纹理），scene pass 里 drawEntities 之后合并（vendor 补丁 onEntities）；P.entScene = false 回到方案 B
  let entRT = null;
  const entTex = t => ({ texture: renderer.properties.get(t).__webglTexture, glslType: 'sampler2D' });
  let entSoft = 0;   // entComp 的两遍：0 = 实心像素（写深度），1 = 软边像素（只混色，深度保持场景原值）
  R.passes.entComp = entComp(kit.Pass, named({ entColor: () => entTex(entRT.texture), entDepth: () => entTex(entRT.depthTexture), hostNear: () => camera.near, hostFar: () => camera.far, soft: () => entSoft }));
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
    gl.bindVertexArray(R.emptyVAO);
    R.passes.entComp.use(); gl.drawArrays(gl.TRIANGLES, 0, 3);                                     // 实心像素：写深度
    entSoft = 1; R.passes.entComp.use();                                                          // 软边像素：只混色（depthMask 关）
    gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, 3); entSoft = 0; gl.depthMask(true);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE);
  };
  const hideSky = () => { for (const k of ['sky', 'sun', 'moon', 'stars', 'clouds']) if (ctx[k]) ctx[k].visible = false; };
  const world = createWorld(R, SRC, ctx.glid || idLUT(ctx.B), { seed: 1 });

  // 参数：只列已经接上的。fog / mist 默认 0 = 去雾版（render.md §0，goodGL 的缺点之一）；scale / maxMP 等 R5 接上 pass.js / vars.js 后再加
  const P_DEFAULTS = { rd: 0 /* 0 = 取宿主设置 */, waving: true, clouds: true, gamma: 0.5, volumetric: true, shadowQ: 2, pbr: true, pom: true, pomShadow: 0.6 /* POM 自阴影强度（朝太阳的遮挡；0 = 无；平滑搜索下只取 0.4 倍） */, pomSmooth: false /* 平滑 POM 搜索（双线性高度 + 二分；关 = 原 14 步；雨天由 rainPom 单独开启） */, rainPom: 1 /* 雨天立体浮雕强度（wet × 本值；0 = 关，雨天也走原 POM） */, taa: true, flare: 100 /* 镜头光斑强度 %（0 = 关；旧存档里的 true / false 按 100 / 0） */, flareIdle: 2 /* 镜头停转多少秒后光斑渐隐（0 = 不抑制） */, lavaSpeed: 2 /* 岩浆贴图滚动速度倍率 */, heatHaze: 1 /* 热浪扭曲强度（火把 / 火焰 / 岩浆上方；0 = 关） */, waterStyle: 0 /* 水体渲染器：0 LiqPG（现状）/ 1 Bliss / 2 Reimagined（water.md §10） */, waterCaustic: 1 /* 水底花纹：0 LiqPG / 1 Bliss（现状）/ 2 Reimagined（无花纹） */, waterClarity: 0.92 /* 透亮（Bliss / Reimagined 的吸收系数） */, waveStrength: 0.05, waveNoise: 0.03, waveScale: 1, waterTexWave: 0.06, waterTexSpeed: 1.2, waterTexNormal: 0.15, waterDeepSat: 1, waterD2: 11, rippleSurge: 0.3 /* 水位变化 → 涌浪脉冲的力度系数（水涌入空格 Δ≈0.89 → ×本值；0 = 关）*/, rippleDelay: 0.5 /* 接触水面多久后才出波纹（s）；入水那一下不出波纹 */, ripple: 1 /* 水波纹强度（玩家入水 / 水面行走的 Eulerian 波纹；0 = 关，同时停掉 sim） */, fireFx: 1 /* 火把 / 火焰 / 岩浆粒子浓度（0 = 关） */, flickAmp: 1 /* 火光闪烁强度（火把 / 岩浆 / 火焰；0 = 稳定） */, flickSpeed: 1 /* 闪烁速度倍率 */, lightDither: 1 /* 光照量化抖动（4 bit 马赫带；0 = 关） */, volCloud: 1 /* 体积光乘云影（0 = 关） */, caveHaze: 1 /* 洞穴火把暖雾强度（0 = 关） */, sharpDist: 98 /* 锐阴影（花草）walk 时的范围；0 = 关 */, sharpSoft: 0.8 /* 锐阴影边缘柔化半径（texel）：0 = 单 tap */, sharpFly: 0 /* fly / noclip 时的范围；0 = 整个锐图 pass 不画 */, fog: 0, mist: 0, ssrSteps: 24 /* 水面屏幕空间反射步数（0 = 只反射天空） */, uwCaustic: 1.4 /* 水下表面焦散强度（v2/gl 图样） */, uwShafts: 1 /* 水下光束强度 */, uwDensity: 1 /* 水体消光 / 散射倍率 */, uwWindow: 4 /* 水下仰视 Snell 窗口 / 全反射的起始深度（格）；更浅时按带扭曲的透视看水面上方 */, foamWidth: 1.2 /* 岸边波纹范围（格） */, shoreFade: 0.3 /* 岸边软化（竖直水深格） */, shoreWaveAmp: 0.12 /* 岸边涌浪起伏（格） */, shoreWaveSpeed: 1, meshJobs: 12 /* 网格任务在途上限（Worker 队列保持这么多；旧版是「每帧最多提交 6 个」，低帧率下加载被帧率卡住） */, meshBudget: 3 /* 每帧提交网格任务（padded 提取）的主线程预算 ms */, appearRise: 12 /* 新网格段从下面升起的高度（格；0 = 不升） */, fadeSec: 0.6 /* 新网格段抖动淡入时长 s（0 = 不淡入；与上升各自独立） */, appearSec: 1.2 /* 出现动画整体时长 s（上升用满；0 = 全关） */, appearNear: 24 /* 离相机这么近（格）的段直接出现，不做动画 */, blobShadow: 0.5 /* 实体脚下软影浓度（0 = 关） */, entExposure: 1 /* 实体（生物 / 掉落物 / TNT）亮度倍率；颜色已按场景光照折算，这里只做整体偏移 */, entScene: true /* 实体进 goodGL 场景（雾 / 云 / tonemap 一致）；关 = 方案 B：final 之后叠画 */ };
  // P = vars 对象（读写值照旧，bench 契约不变）；meta.folder 给面板分文件夹：雾、云隙光各一组（render.md 备忘「天空 / 雾 / 云隙光」），面板本身 R7 才建
  // root：面板顶层分两个并排的 Pane（rgl/panel.js）：v2 = 沿用 v2/goodGL 的项，v3 = remix 新增（花草 / 水 / 水下 / 实体）；整理文件夹时按 root 各管各的
  const V3_FOLDERS = new Set(['花草锐阴影', '水', '水下', '实体', '新区块']);
  const FOLDER = (f, o = {}) => ({ folder: f, root: V3_FOLDERS.has(f) ? 'v3' : 'v2', ...o });
  const P = vars(P_DEFAULTS, {
    rd: FOLDER('渲染', { min: 0, max: 16, step: 1, label: '视距（0 = 取宿主）' }), waving: FOLDER('渲染'), clouds: FOLDER('渲染'), gamma: FOLDER('渲染', { min: 0, max: 1 }), shadowQ: FOLDER('渲染', { min: 1, max: 2, step: 1 }),
    pbr: FOLDER('渲染'), pom: FOLDER('渲染'), pomSmooth: FOLDER('渲染', { label: '平滑 POM 搜索' }), pomShadow: FOLDER('渲染', { min: 0, max: 1, step: 0.05, label: 'POM 自阴影' }), rainPom: FOLDER('渲染', { min: 0, max: 2, step: 0.05, label: '雨天浮雕强度' }), taa: FOLDER('渲染'), flare: FOLDER('渲染', { min: 0, max: 200, step: 1, label: '镜头光斑（%）' }), flareIdle: FOLDER('渲染', { min: 0, max: 10, step: 0.5, label: '光斑停转渐隐（秒，0 = 关）' }), lightDither: FOLDER('渲染', { min: 0, max: 2, step: 0.05, label: '光照抖动（去马赫带）' }),
    volCloud: FOLDER('云隙光', { min: 0, max: 1, step: 0.05, label: '云影遮挡光柱' }), caveHaze: FOLDER('云隙光', { min: 0, max: 3, step: 0.05, label: '洞穴火把暖雾' }),
    lavaSpeed: FOLDER('雾', { min: 0, max: 6, step: 0.1, label: '岩浆滚动速度' }),
    heatHaze: FOLDER('雾', { min: 0, max: 3, step: 0.05, label: '热浪扭曲' }),
    fireFx: FOLDER('雾', { min: 0, max: 2, step: 0.05, label: '火把 / 岩浆粒子' }),
    flickAmp: FOLDER('雾', { min: 0, max: 3, step: 0.05, label: '火光闪烁强度' }), flickSpeed: FOLDER('雾', { min: 0.2, max: 3, step: 0.05, label: '火光闪烁速度' }),
    mist: FOLDER('雾', { min: 0, max: 1, label: '晨昏薄雾' }), fog: FOLDER('雾', { min: 0, max: 0.02, label: '距离雾密度' }),
    volumetric: FOLDER('云隙光', { label: '体积光（云隙光 / 雾中光束）' }),
    sharpDist: FOLDER('花草锐阴影', { min: 0, max: 128 }), sharpSoft: FOLDER('花草锐阴影', { min: 0, max: 3 }), sharpFly: FOLDER('花草锐阴影', { min: 0, max: 128 }), blobShadow: FOLDER('实体', { min: 0, max: 0.8 }), entScene: FOLDER('实体'), entExposure: FOLDER('实体', { min: 0.3, max: 3, step: 0.05 }),
    uwWindow: FOLDER('水下', { min: 0, max: 16, label: '窗口起始深度（格）' }), uwCaustic: FOLDER('水下', { min: 0, max: 4, label: '焦散' }), uwShafts: FOLDER('水下', { min: 0, max: 4, label: '光束' }), uwDensity: FOLDER('水下', { min: 0.2, max: 4, label: '水体浓度' }),
    waterStyle: FOLDER('水体', { options: { 'LiqPG（现状）': 0, 'Bliss': 1, 'Reimagined': 2 }, label: '水体渲染器' }),
    waterCaustic: FOLDER('水体', { options: { 'LiqPG': 0, 'Bliss（v2/gl）': 1, 'Reimagined（无花纹）': 2, 'Pool': 3 }, label: '水底焦散' }),
    waterClarity: FOLDER('水体', { min: 0, max: 1, step: 0.01, label: '透亮（Bliss / Reimagined）' }),
    waveStrength: FOLDER('水体', { pair: 'waveNoise', min: 0, max: 0.2, step: 0.005, min2: 0, max2: 0.4, step2: 0.005, label: '波浪 正弦/噪声（Bliss）' }), waveNoise: FOLDER('水体', { hidden: true }),
    waveScale: FOLDER('水体', { min: 0.2, max: 4, step: 0.05, label: '噪声频率（Bliss）' }),
    waterTexWave: FOLDER('水体', { pair: 'waterTexSpeed', min: 0, max: 0.25, step: 0.005, min2: 0, max2: 4, step2: 0.05, label: '贴图波动 幅度/速度（Reimagined）' }), waterTexSpeed: FOLDER('水体', { hidden: true }),
    waterTexNormal: FOLDER('水体', { min: 0, max: 1, step: 0.01, label: '贴图法线（Reimagined）' }),
    waterDeepSat: FOLDER('水体', { min: 0, max: 1, step: 0.01, label: '深水饱和' }),
    waterD2: FOLDER('水体', { min: 1, max: 24, step: 0.5, label: '深水参考深度（格）' }),
    rippleSurge: FOLDER('水', { min: 0, max: 1, step: 0.01, label: '涌入涌浪力度' }),
    rippleDelay: FOLDER('水', { min: 0, max: 3, step: 0.1, label: '水波纹延迟（s）' }),
    ripple: FOLDER('水', { min: 0, max: 3, step: 0.05, label: '玩家水波纹强度' }),
    foamWidth: FOLDER('水', { min: 0, max: 1.5, label: '岸边波纹范围' }), shoreFade: FOLDER('水', { min: 0, max: 1.5, label: '岸边软化' }), shoreWaveAmp: FOLDER('水', { min: 0, max: 0.3, label: '岸边涌浪起伏' }), shoreWaveSpeed: FOLDER('水', { min: 0, max: 3, label: '岸边涌浪速度' }),
    ssrSteps: FOLDER('水', { min: 0, max: 48, step: 1, label: '反射步数（SSR）' }),
    meshJobs: FOLDER('新区块', { min: 1, max: 15, step: 1, label: '网格任务' }), meshBudget: FOLDER('新区块', { min: 1, max: 7, step: 1, label: '提交预算（ms）' }),
    appearRise: FOLDER('新区块', { min: 0, max: 32, step: 1, label: '高度差（格，0 = 不升）' }), fadeSec: FOLDER('新区块', { min: 0, max: 4, step: 0.1, label: '淡入时长（s，0 = 不淡入）' }), appearSec: FOLDER('新区块', { min: 0, max: 4, step: 0.1, label: '整体时长（s，0 = 全关）' }), appearNear: FOLDER('新区块', { min: 0, max: 64, step: 2, label: '近处直接出现（格）' }),
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
    casters: () => ctx.shadowCasters, getF: () => (nFrames ? Fpv : null), strength: () => P.blobShadow,
    groundY: (x, y, z) => { const ix = Math.floor(x), iz = Math.floor(z); for (let k = Math.floor(y + 0.5), lo = Math.max(0, k - 8); k >= lo; k--) if (ctx.SOLID[ctx.getBlock(ix, k, iz)]) return k + 1; return null; },
  });
  const fire = createFireFx(THREE, ctx.scene, { source: SRC, bt: BT, camera, getF: () => (nFrames ? Fpv : null), opacity: () => P.fireFx });   // 火把 / 火焰 / 岩浆粒子（rgl/fire.js）
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
      tick: day * 24000, dayCount: 0, underwater: ENV.eyeInWater, eyeSky: ENV.eyeSky, eyeBlk: ENV.eyeBlk, waterTop: ENV.eyeWaterTop, rain: wx.rain, flash: wx.thunder, wet: wx.wet, time: D.time != null ? D.time : sec, cloudTime: D.cloudX != null ? D.cloudX : sec, dt, ref: D.ref,
      S: { ...P, sharpDist: sharpNow }, dbg: { fog: P.fog, mist: P.mist } });
    setFrame(F);
    uploadField();
    if (DEV && ENV.sunDir) { const s = ENV.sunDir, d = Math.hypot(s.x - F.sunDir[0], s.y - F.sunDir[1], s.z - F.sunDir[2]); if (d > 2e-3 && !warnedSun) { warnedSun = true; console.warn('rgl: 宿主 Env.sunDir 与 goodGL celestial 不一致（日月轨迹必须同源）', d, [s.x, s.y, s.z], F.sunDir); } }
    resetGLState(gl);
    R.ensureTargets(W, H);
    world.pump(e[12], e[13], e[14], rd, P.meshJobs, P.meshBudget);
    R.cull(F, world, rd);                                                       // F.all / F.visible（remix: frame.js 里先置空）
    rises.clear();                                                              // 出现动画：born = 0（刚出网格）→ 第一次进视锥时开始计时；近处 / 关闭时直接清掉
    { const on = P.appearSec > 0 && (P.appearRise > 0 || P.fadeSec > 0) && !D.ref && D.time == null, now = performance.now() / 1000;
      for (const v of F.all) {
        const sec = v.sec; if (sec.born == null) continue;
        if (!on || v.dist < P.appearNear) { sec.born = null; continue; }
        if (sec.born === 0) { if (!v.inside) continue; sec.born = now; }
        const el = now - sec.born, t = el / P.appearSec; if (t >= 1) { sec.born = null; continue; }
        const k = t * t * (3 - 2 * t), f = P.fadeSec > 0 ? Math.min(1, el / P.fadeSec) : 1;   // 上升与淡入各算各的：上升按整体时长（smoothstep），淡入按淡入时长（线性）
        rises.set(rkey(v.ox, v.oy, v.oz), [P.appearRise * (1 - k), f]);
      } }
    if (qExt && !D.noTimer) gpuPoll();
    const timed = !!qExt && !D.noTimer && !qSet, bf = gl.bindFramebuffer;   // 上一组还没读到结果就不开始新的一组（GPU 结果晚一两帧才可用），和 v2/gl 一样隔帧采样
    if (timed) {
      qCur = []; qActive = false;
      gl.bindFramebuffer = function (target, f) {                              // 只在这一帧内包一层，之后删掉（恢复原型方法）
        bf.call(gl, target, f);
        if (target === gl.FRAMEBUFFER) { const n = passOf(f); if (n && (!qCur.length || qCur[qCur.length - 1].name !== n)) qBegin(n); }
      };
    }
    fire.update(dt, F);
    ripples.update(dt, camera.position, P.ripple, P.rippleDelay); if (!ripples.awake()) F.ripple = 0;                              // 在 renderFancy 之前：sim 是离屏小 pass，之后 restore 状态
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
    reloadTextures() { resetGLState(gl); loadTextures(); if (T().histValid !== undefined) T().histValid = false; },   // 资源包换了：重传贴图 + 重算 PBR（three 刚用过上下文，先还原 UNPACK 状态）
    ripples,              // 水面波纹（rgl/ripple.js）：poke / step 给 bench 用
    fire,                 // 火把 / 火焰 / 岩浆粒子（rgl/fire.js；stats() 给发射点计数）
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
    entityLight: createEntityLight(() => (nFrames ? Fpv : null), { scene: () => P.entScene, gain: () => P.entExposure }),                 // 宿主 lightColor() 的钩子：实体在 final 之后画，光照走 CPU（entlight.js）
    source: SRC, blockTable: BT, env: ENV, R, world,
  };
}
