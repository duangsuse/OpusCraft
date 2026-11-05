// rgl/skypack.js —— 资源包的天空资产（goal-renderapi.ts §2b SkyAssets）→ skyF 的纹理 / 宏 / uniform（rgl/long/sky.js）。
//   sun.png / moon_phases.png 换掉 goodGL 画的方块日月；Iris 开关 sun / moon / sky / stars；pano*.hdr 全景（RGBA16F）替换大气天空底色。
//   没有资产 = 宏全是原值（SKY_SUN 1 / SKY_MOON 1 / SKY_BASE 1 / SKY_STARS 1 / SKY_PANO 0），skyF 与改动前逐字等价。
// 全景渐变（用户 2026-11-05）：pano1..9 = 有数字，随昼夜进度在相邻两张间渐变；没数字 = 静态。
//   只有 day：day 的 N 张循环均分整个昼夜，亮度跟大气天顶走（夜里自然变暗，星星照常叠在上面）。
//   有 night：两者都只取上半球，day 均分白天（dayTime 0 → 0.5 = 06:00 → 18:00），night 均分夜里，按 skyF 的 night 因子渐变成一个天空。
const NIGHT_REF = 0.03;   // 夜景全景按 mean 归一化后的亮度基准（procgen 星星峰值 ~2.4、银河 ~0.1）

export function createSkyPack(gl, tex, getP) {
  const mk = (w, h, ifmt, fmt, type, data, filter, wrapS) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null); return t;
  };
  const rgba8 = img => mk(img.w, img.h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), gl.NEAREST, gl.CLAMP_TO_EDGE);
  const half = p => Object.assign(mk(p.w, p.h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, p.data, gl.LINEAR, gl.REPEAT), { mean: p.mean });
  const dummy = mk(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4), gl.NEAREST, gl.CLAMP_TO_EDGE);
  const S = { sun: null, moon: null, day: [], night: [], timed: false, show: { sun: true, moon: true, sky: true, stars: true } };
  const bind = [dummy, dummy, dummy, dummy], inv = new Float32Array([1, 1, 1, 1]), mix = new Float32Array(4), exp = new Float32Array(2);

  function load(sky) {
    for (const t of [S.sun, S.moon, ...S.day, ...S.night]) if (t) gl.deleteTexture(t);
    S.sun = sky && sky.sun ? rgba8(sky.sun) : null; S.moon = sky && sky.moon ? rgba8(sky.moon) : null;
    S.day = sky ? sky.day.map(half) : []; S.night = sky ? sky.night.map(half) : [];
    S.timed = !!(sky && sky.timed); S.show = sky ? { ...sky.show } : { sun: true, moon: true, sky: true, stars: true };
    bind.fill(dummy);
  }
  // [i0, i1, t]：cyc = 循环均分 u∈[0,1)；否则 u 夹到 [0,1] 线性均分
  const pick = (n, u, cyc) => {
    if (n <= 1 || !S.timed) return [0, 0, 0];
    if (cyc) { const x = (u - Math.floor(u)) * n, i = Math.floor(x); return [i % n, (i + 1) % n, x - i]; }
    const x = Math.min(Math.max(u, 0), 1) * (n - 1), i = Math.min(n - 2, Math.floor(x)); return [i, i + 1, x - i];
  };
  /** 每帧：day = Env.dayTime（0..1，0 = 06:00） */
  function frame(day) {
    const P = getP(), D = S.day, N = S.night, both = N.length > 0;
    const [a0, a1, at] = pick(D.length, both ? day / 0.5 : day, !both), [b0, b1, bt] = pick(N.length, ((day - 0.5) % 1 + 1) % 1 / 0.5, false);
    bind[0] = D[a0] || dummy; bind[1] = D[a1] || dummy; bind[2] = N[b0] || dummy; bind[3] = N[b1] || dummy;
    for (let i = 0; i < 4; i++) inv[i] = bind[i].mean ? 1 / bind[i].mean : 1;
    mix[0] = at; mix[1] = bt; mix[2] = 0; mix[3] = D.length ? 1 : 0;
    exp[0] = P.panoExp; exp[1] = P.panoNightExp * NIGHT_REF;
  }
  const P = () => getP();
  const X = {
    skySunM: () => !S.show.sun ? 0 : S.sun ? 2 : 1, skyMoonM: () => !S.show.moon ? 0 : S.moon ? 2 : 1,
    skyBaseM: () => S.show.sky ? 1 : 0, skyStarsM: () => S.show.stars ? 1 : 0,
    skyPanoM: () => S.night.length ? 2 : S.day.length ? 1 : 0,
    sunTex: () => tex(S.sun || dummy), moonTex: () => tex(S.moon || dummy),
    panoD0: () => tex(bind[0]), panoD1: () => tex(bind[1]), panoN0: () => tex(bind[2]), panoN1: () => tex(bind[3]),
    panoInv: () => inv, panoMix: () => mix, panoExp: () => exp,
    panoClamp: () => P().panoClamp > 0 ? P().panoClamp : 1e9, panoRot: () => P().panoRot / 360,
    sunSize: () => P().sunSize, moonSize: () => P().moonSize,
  };
  const stat = () => (S.sun ? 'sun ' : '') + (S.moon ? 'moon ' : '') + (S.day.length ? `pano×${S.day.length} ` : '') + (S.night.length ? `night×${S.night.length} ` : '') + (S.timed ? 'timed' : '');
  return { load, frame, X, stat };
}
