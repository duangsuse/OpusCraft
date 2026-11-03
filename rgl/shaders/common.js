// rgl/shaders/common.js —— fancy / water（以及以后更多 program）共用的 uniform 来源：同名同来源，各 pass 的 `${X.xxx}` 引用同一个对象
//   fm.hand：画手时 fancy 用另一组值（光向 / 光色 / 视图投影、关阴影与 POM、不摆动）；同一个 program，只是 use() 前由 renderFancy 置位。
import { u } from '../pass.js';
import { F } from '../frameref.js';
export function commonX(R, tex, T) {
  const fm = R.fm = { hand: false }, handCol = new Float32Array(3), raw = { texture: null, sampler: null, glslType: 'sampler2D' }, ONE4 = [1, 1, 1, 1];
  return {
    viewProj: u('viewProj', () => fm.hand ? F.handProj : F.viewProj),
    wind: u('wind', () => fm.hand ? 0 : F.waving ? 1 : 0),
    shadowRes: u('shadowRes', () => R.shadowRes),
    shadowRange: u('shadowRange', () => F.shadowDist),
    lightDir: u('lightDir', () => fm.hand ? F.handLightDir : F.lightDir),
    lightCol: u('lightCol', () => { if (!fm.hand) return F.lightCol; for (let i = 0; i < 3; i++) handCol[i] = F.lightCol[i] * F.handShadow; return handCol; }),
    wet: u('wet', () => F.wet || 0),
    colorMul: u('colorMul', () => ONE4),
    sharpRes: u('sharpRes', () => R.sharpRes),
    shadow: u('shadow', () => tex(R.shadowTex, 'sampler2DShadow')),
    shadowRaw: u('shadowRaw', () => { raw.texture = R.shadowTex; raw.sampler = R.rawSampler; return raw; }),      // 值带 sampler：Pass 绑它而不是 null
    sharp: u('sharp', () => tex(R.sharpTex, 'sampler2DShadow')),
    nrm: u('nrm', () => tex(R.nrmTex, 'sampler2DArray')),
    spec: u('spec', () => tex(R.specTex, 'sampler2DArray')),
    rain: u('rain', () => F.rain || 0), flash: u('flash', () => F.flash || 0),
    sceneColor: u('sceneColor', () => tex(T().copyC)), sceneDepth: u('sceneDepth', () => tex(T().copyD)),
    // 宏（pass.js：`#` 行里的 ${} 取值进编译缓存键；切换命中缓存，GLSL 里是常量，编译器折叠分支）
    shadowM: () => fm.hand ? 0 : 1, pbrM: () => F.pbr === false ? 0 : 1, pomM: () => F.pom === false || fm.hand ? 0 : 1, cloudShM: () => F.clouds ? 1 : 0, underM: () => F.underwater ? 1 : 0,
    res: u('res', () => [F.w, F.h]),
  };
}
