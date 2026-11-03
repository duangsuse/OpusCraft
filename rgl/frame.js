// 帧对象 F 的构造：goodGL `Game.render`（L6142–6300）里 fancy 路径的搬运，宿主相关的输入全部从参数进来。
//   R2：天空 / 云 / 合成 / TAA / bloom / final 用到的字段；方块、实体、手、天气粒子（F.visible / F.all / dyn*）留给 R3 之后。
//   R5 会把这里整理成 render.md §4 的 `xlate.frame(env, host, out)`；现在先让它能跑。
//   与原版的差异都标了 `// remix:`；其余逐行对应，行号是 goodGL.html 里的位置，方便对读。
import { M4 } from '../vendor/gl/mathx.js';
import { Atmos } from '../vendor/gl/atmos.js';

const DEG = Math.PI / 180;                                                                        // L5555
function smooth01(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }   // L5559
function mixv(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }       // L5560

// 日月位置（L6118–6131 的 celestial / environment，fancy 路径：倾角 28°）
export function celestial(tick) {
  const t = tick % 24000; let f = t / 24000 - 0.25; if (f < 0) f += 1; if (f > 1) f -= 1;
  const f2 = f; f = 1 - (Math.cos(f * Math.PI) + 1) / 2; return f2 + (f - f2) / 3;
}
export function environment(tick) {
  const a = celestial(tick), th = a * Math.PI * 2, tilt = 28 * DEG;
  const sunDir = [-Math.sin(th), Math.cos(th) * Math.cos(tilt), Math.cos(th) * Math.sin(tilt)];
  return { a, th, sunDir, moonDir: [-sunDir[0], -sunDir[1], -sunDir[2]], pathAxis: [0, Math.sin(tilt), -Math.cos(tilt)] };
}

// 有状态的帧构造器：TAA 抖动序号、上一帧 VP、自动曝光、环境光缓存、眼处天空光
export function createFrameBuilder() {
  const st = { taaI: 0, prevVP: null, prevEye: null, exposure: 1, ambT: null, ambKey: null, eyeSky: 1, caveFactor: 0 };
  // reset：bench 的 resetLag（机位切换后 TAA 历史作废、曝光和 caveFactor 直接取目标值）
  const reset = () => { st.taaI = 0; st.prevVP = null; st.prevEye = null; st.ambT = null; st.ambKey = null; st.snap = true; };

  /** in = { W, H, eye, fwd, up, fovDeg, rd, tick, dayCount, time, cloudTime, dt,
   *         rain, flash, wet, underwater, S: {waving, clouds, gamma, volumetric, pbr, pom, taa, shadowQ, flare}, dbg } */
  function build(inp) {
    const { W, H, eye, fwd, up, rd, tick, dt } = inp, S = inp.S;
    const env = environment(tick);
    const rdBlocks = rd * 16, far = Math.max(rdBlocks * 1.6, 300), near = 0.05;                   // L6162
    const proj = M4.perspective(inp.fovDeg * DEG, W / H, near, far);
    const view = M4.lookDir(fwd, up);                                                             // remix: 宿主相机的 up（含滚转）；原版固定 [0,1,0]，并带 bob / 受伤倾斜（宿主已经做在相机里）
    const viewProj = M4.mul(proj, view), invViewProj = M4.invert(viewProj);
    const m = viewProj, planes = [];
    const pl = (a, b, c, d) => { const l = Math.hypot(a, b, c); planes.push([a / l, b / l, c / l, d / l]); };
    pl(m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); pl(m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    pl(m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); pl(m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    pl(m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); pl(m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
    // TAA：Halton(2,3) 8 点亚像素抖动，只作用在光栅投影上（L6181–6189）
    const taa = S.taa !== false && !inp.ref;                                                      // remix: REF 模式（bench.md §4）：TAA 关
    let viewProjR = viewProj;
    if (taa) {
      const hal = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
      st.taaI = (st.taaI % 8) + 1;
      const jx = (hal(st.taaI, 2) - 0.5) * 2 / W, jy = (hal(st.taaI, 3) - 0.5) * 2 / H;
      const pj = proj.slice(); pj[8] -= jx; pj[9] -= jy; viewProjR = M4.mul(pj, view);
    }
    const prevVP = st.prevVP || viewProj, prevEye = st.prevEye || eye;
    const camDelta = [eye[0] - prevEye[0], eye[1] - prevEye[1], eye[2] - prevEye[2]];
    const taaReset = !st.prevVP || Math.hypot(camDelta[0], camDelta[1], camDelta[2]) > 4;
    st.prevVP = viewProj; st.prevEye = eye.slice();
    const rain = inp.rain || 0, flash = inp.flash || 0;
    const F = { w: W, h: H, camPos: eye, proj, view, viewProj: viewProjR, viewProjU: viewProj, invViewProj, taa, prevViewProj: prevVP, camDelta, taaReset, invViewProjSky: invViewProj, planes, near, far,
      time: inp.time, fancy: true,
      sunDir: env.sunDir, moonDir: env.moonDir, pathAxis: env.pathAxis, starRot: env.th, moonPhase: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875][(inp.dayCount || 0) % 8], cloudTime: inp.cloudTime,
      waving: S.waving, clouds: S.clouds, gamma: S.gamma, flicker: 1.0 + (Math.sin(inp.time * 1000 * 0.011) * 0.02 + Math.sin(inp.time * 1000 * 0.023) * 0.02), renderDist: rdBlocks, volumetric: S.volumetric, pbr: S.pbr !== false, pom: S.pom !== false };
    F.visible = []; F.all = [];                                                                   // remix: R3 前没有区块；R.cull 由 R3 接上
    F.underwater = !!inp.underwater;                                                              // remix: 原版读世界方块；这里由宿主 Env 给
    // 眼处天空光 / 洞穴系数：原版 L6200–6203 按眼处光照渐变。remix: R2 没有世界，取 1 / 0；R5 接 Env
    st.eyeSky = inp.eyeSky != null ? inp.eyeSky : 1; st.caveFactor = 1 - smooth01(0.1, 0.6, st.eyeSky);
    const sunH = env.sunDir[1];
    F.rain = rain; F.flash = flash; F.wet = inp.wet || 0; F.cov = (inp.cov != null ? inp.cov : 0.4 + 0.08 * Math.sin(tick / 9000)) + 0.5 * rain;
    // ---- fancy：大气、光照、阴影矩阵、雾、曝光（L6206–6270）
    const alt = 0.3 + Math.max(0, eye[1] - 64) * 0.001;
    const sunI = 16, moonI = 16 * 0.004; F.sunI = sunI; F.moonI = moonI; F.camAlt = alt;
    const Rg = Atmos.Rg, Ts = Atmos.trans([0, Rg + alt, 0], env.sunDir, rain), Tm = Atmos.trans([0, Rg + alt, 0], env.moonDir, rain);
    const dim = 1 - 0.82 * rain;
    const sunCol = Ts.map(v => v * 3.7), moonCol = Tm.map((v, i) => v * [0.5, 0.66, 1.0][i] * 0.2);
    F.sunCol = sunCol; F.moonCol = moonCol;
    const useSun = sunH > -0.02;
    F.pomSmooth = !!S.pomSmooth; F.pomShadow = S.pomShadow != null ? S.pomShadow : 0.6;
    F.rainPom = S.rainPom != null ? S.rainPom : 1;
    F.foamWidth = S.foamWidth != null ? S.foamWidth : 1.2; F.shoreFade = S.shoreFade != null ? S.shoreFade : 0.3; F.shoreAmp = S.shoreWaveAmp != null ? S.shoreWaveAmp : 0.12; F.shoreSpd = S.shoreWaveSpeed != null ? S.shoreWaveSpeed : 1;   // remix: v2/gl 的岸边波纹参数（面板「水」）
    F.ssrSteps = S.ssrSteps != null ? S.ssrSteps : 24;                                          // remix: 水面 SSR 步数（LiqPG 档位 0 / 16 / 24 / 40）
    F.useSun = useSun;                                                                            // remix: 日 / 月切换的唯一判据（光向、云光、…都读它，别各写各的 sunDir.y 阈值）
    F.lightDir = useSun ? env.sunDir : env.moonDir;
    F.lightCol = (useSun ? sunCol.map(v => v * smooth01(-0.02, 0.05, sunH)) : moonCol.map(v => v * smooth01(0.02, 0.1, -sunH))).map(v => v * dim);
    const dayAmt = smooth01(-0.2, 0.15, sunH); F.dayAmt = dayAmt;
    const ssk = Math.exp(-Math.pow(Math.max(sunH + 0.02, 0) * 4.5, 2)) * smooth01(-0.28, -0.02, sunH);
    const key = Math.round(tick / 4) + ':' + Math.round(rain * 50);                              // 原版：Math.round(this.time / 4)
    if (!st.ambT || st.ambKey !== key) {
      st.ambKey = key;
      let a = Atmos.ambient(env.sunDir, sunI, env.moonDir, moonI, alt, rain);
      const l = a[0] * 0.3 + a[1] * 0.55 + a[2] * 0.15; a = a.map(v => (v * 0.72 + l * 0.28) * 0.95);
      const night = 1 - dayAmt; a = [a[0] + 0.010 * night, a[1] + 0.015 * night, a[2] + 0.034 * night];
      if (rain > 0) { const l2 = a[0] * 0.3 + a[1] * 0.55 + a[2] * 0.15; a = a.map(v => v * (1 - rain * 0.55) + l2 * rain * 0.45); }
      st.ambT = a;
    }
    F.ambCol = st.ambT.map(v => v + flash * 0.6);
    F.torchCol = [1.0, 0.52, 0.2];
    F.aurora = (1 - dayAmt) * (inp.auroraBiome ? 1.0 : 0.35);                                     // remix: 原版按眼处群系；R2 取常量 0.35（render.md §2 Env 缺 biomeAt）
    const sd = S.shadowQ >= 2 ? 150 : 100; F.shadowDist = sd;
    const so = [Math.floor(eye[0] / 4) * 4, Math.floor(eye[1] / 4) * 4, Math.floor(eye[2] / 4) * 4];
    F.shadowOrigin = so; F.camToShadow = [eye[0] - so[0], eye[1] - so[1], eye[2] - so[2]];
    const L = F.lightDir, upv = Math.abs(L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const sv = M4.lookDir([-L[0], -L[1], -L[2]], upv);
    F.shadowMat = M4.mul(M4.ortho(-sd, sd, -sd, sd, -320, 320), sv);
    const sr = S.sharpDist != null ? S.sharpDist : 64; F.sharpDist = sr; F.sharpSoft = S.sharpSoft != null ? S.sharpSoft : 0.8; F.sharpMat = M4.mul(M4.ortho(-sr, sr, -sr, sr, -320, 320), sv);              // remix: R3b 锐阴影图，同光向同原点，不做 df 扭曲
    const t = tick % 24000, morning = t > 22000 ? smooth01(22000, 23800, t) : t < 4500 ? 1 - smooth01(1500, 4500, t) : 0;
    F.mist = 0.12 + 0.45 * morning + 0.3 * (1 - dayAmt) + 0.5 * rain;
    F.fogDensity = 0.0016 + 0.004 * rain;
    const dbg = inp.dbg;                                                                          // 原版 Game.dbg：fog / mist / vol / exp 覆写（去雾版用它）
    if (dbg) { if (dbg.mist !== undefined) F.mist = dbg.mist; if (dbg.fog !== undefined) F.fogDensity = dbg.fog; if (dbg.vol !== undefined) F.volumetric = dbg.vol; if (dbg.exp !== undefined) st.exposure = dbg.exp; }
    F.waterTop = inp.waterTop != null ? inp.waterTop : eye[1] + 1;                                // remix: 眼上方水面的世界 y（Env.eyeWaterTop）；没给就当离眼 1 格
    F.waterCol = (inp.waterCol || [0.05, 0.22, 0.5]).map(v => v * Math.min(1, Math.max(0.1, st.eyeSky)));     // 水体散射色（线性）× 眼处天空光（water.md §1）；宿主 A 没有群系水色
    F.camDepth = F.waterTop - eye[1]; F.uwWindow = S.uwWindow != null ? S.uwWindow : 4;                          // remix: 相机在水面下多深（格）；水下仰视窗口只在 ≥ uwWindow 格深时启用
    F.uwCaustic = S.uwCaustic != null ? S.uwCaustic : 1.4; F.uwShafts = S.uwShafts != null ? S.uwShafts : 1; F.uwDensity = S.uwDensity != null ? S.uwDensity : 1;
    F.waterFog = mixv([0.002, 0.008, 0.015], [0.03, 0.12, 0.2], dayAmt);
    const sp = M4.xform(viewProj, [env.sunDir[0] * 1000, env.sunDir[1] * 1000, env.sunDir[2] * 1000, 1]);
    if (sp[3] > 0) { F.sunUV = [sp[0] / sp[3] * 0.5 + 0.5, sp[1] / sp[3] * 0.5 + 0.5]; const edge = Math.max(Math.abs(F.sunUV[0] - 0.5), Math.abs(F.sunUV[1] - 0.5)); F.sunVis = smooth01(0.9, 0.5, edge) * smooth01(-0.05, 0.05, sunH) * (0.4 + 0.6 * (1 - smooth01(0.1, 0.6, sunH))); }
    else { F.sunUV = [0.5, 0.5]; F.sunVis = 0; }
    F.caveFactor = st.caveFactor;
    const la = F.ambCol[0] * 0.3 + F.ambCol[1] * 0.55 + F.ambCol[2] * 0.15, ls = F.lightCol[0] * 0.3 + F.lightCol[1] * 0.55 + F.lightCol[2] * 0.15;
    const outdoor = Math.max(0.62, Math.min(1.75, 0.8 / Math.pow(la * 1.3 + ls * 0.22 + 0.004, 0.42)));
    const target = outdoor * (1 - st.caveFactor) + 2.6 * st.caveFactor;
    if (st.snap || inp.ref) { st.exposure = target; st.snap = false; }                                      // remix: resetLag 之后曝光直接取目标值（bench.md §4 第 3 行）
    else st.exposure += (target - st.exposure) * Math.min(1, dt / 1200);
    F.exposure = st.exposure * (0.85 + S.gamma * 0.3); F.bloomAmt = 0.07; F.saturation = 1.08; F.grade = mixv([1.0, 1.0, 1.0], [1.04, 0.99, 0.94], ssk);
    F.hurt = 0;
    F.scotopic = (1 - dayAmt) * (1 - 0.6 * st.caveFactor);
    F.flare = S.flare === false ? 0 : 0.035 * F.sunVis;
    F.handLightDir = M4.xform(view, [F.lightDir[0], F.lightDir[1], F.lightDir[2], 0]).slice(0, 3);
    F.handShadow = 1;
    F.handProj = M4.perspective(70 * DEG, W / H, 0.05, 10);
    return F;
  }
  return { build, reset, state: st };
}
