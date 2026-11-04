// rgl/ambient.js —— 宿主 B 的氛围粒子：落叶 + 水下（呼吸气泡 / 悬浮微粒），全部是 gm.flutter（rgl/flutter.js）的三个发射器；这里只管「放在哪、放什么颜色、哪些参数暴露」。
//   移植自 goodPG 的 ambientParticles.ts（study-gl.md §3.4、§4.6）。粒子的运动 / 光照 / 介质 / 深度合并 / 叶片与气泡的绘制都在 flutter.js，这里不再有任何 GL 代码。
//
// 参数分三层（每帧合并，后者覆盖前者）：
//   1. 动态参数字典 gg.ambientParams —— 运行时随便改（控制台 / 脚本），不进面板。每项 = flutter 的动态参数（rate / size / fall / flip …）+ 本文件自己的几个「放置」参数：
//        leaf.bright 叶色亮度倍率 · leaf.var 每片叶子明暗随机幅度 · leaf.autumnAmt 转色程度（0 = 不变，1 = 全变成转色叶颜色）· leaf.scanY [下, 上] 发射区相对玩家的 y 范围 · leaf.radius 发射区半径
//        bubble.mouth 气泡离眼睛的向下偏移 · mote.radius 微粒区半径 · mote.height 微粒区上下范围
//   2. 面板（vr.P，「花草锐阴影」文件夹）—— 常调的：ambientFx 总量 · leafRate bubbleRate moteRate 概率倍率 · leafSize leafFall leafSway 手感倍率
//        leafColor + leafMix（0 = 取树叶方块的群系色，1 = 全用 leafColor）· leafAutumn 转色叶占比 + leafAutumnColor · bubbleHi bubbleAlpha bubbleRim
//   3. 每帧写入 h.set()：rate = 字典.rate × 概率倍率 × 总量；size / fall / sway / tilt 乘手感倍率；look = 气泡三项。
//   静态（sprite / medium / contact …）见 flutter.js 头注释：这里创建时写死，不暴露。
const hex = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];

export function install(gg, vr) {
  const { world, B, player, Blocks, Mesher, BIOMES, Atlas, FACE_PZ } = gg, rnd = Math.random, fl = vr.flutter, P = vr.P;
  const leafIds = new Set(['oak_leaves', 'birch_leaves', 'spruce_leaves', 'cherry_leaves'].map(k => B[k]).filter(v => v != null));

  const D = gg.ambientParams = {   // 动态参数字典（默认值 = flutter.presets 里同名预设 + 本文件的放置参数）
    leaf: { ...fl.presets.leaf, bright: 1, var: 0.15, autumnAmt: 0.55, scanY: [-4, 6], radius: 12 },
    bubble: { ...fl.presets.bubble, mouth: 0.15 },
    mote: { ...fl.presets.mote, radius: 6, height: 2 },
  };
  const STATIC = new Set(['sprite', 'medium', 'onLiquid', 'contact', 'max']), ONLY = {
    leaf: new Set(['bright', 'var', 'autumnAmt', 'scanY', 'radius']), bubble: new Set(['mouth']), mote: new Set(['radius', 'height']),
  };
  const dyn = k => { const o = {}; for (const [n, v] of Object.entries(D[k])) if (!STATIC.has(n) && !ONLY[k].has(n)) o[n] = v; return o; };

  function leafColor(id, x, z) {   // 群系色 ↔ 自定叶色（leafMix）→ 亮度 / 随机明暗 → 一部分转黄 / 转橙
    const def = Blocks.byId[id]; let c = [0.3, 0.55, 0.2];
    if (def) { const k = Blocks.tilesFor(def, 0)[FACE_PZ] * 3, tint = Mesher.tintFor(def, FACE_PZ, BIOMES[world.getBiome(x, z)]); c = [Atlas.avgColor[k] * tint[0], Atlas.avgColor[k + 1] * tint[1], Atlas.avgColor[k + 2] * tint[2]]; }
    const L = D.leaf, mix = P.leafMix ?? 0, cu = hex(P.leafColor ?? 0x5a8f2a), v = L.bright * (1 + L.var * (rnd() * 2 - 1));
    c = c.map((e, i) => (e + (cu[i] - e) * mix) * v);
    const m = rnd(), pa = P.leafAutumn ?? 0.22;
    if (m < pa) { const a = L.autumnAmt * (0.5 + 0.5 * m / pa), au = hex(P.leafAutumnColor ?? 0xd9962a); c = c.map((e, i) => e + (au[i] * v - e) * a); }
    return c;
  }
  const around = (r, y0, y1) => () => [player.x - r, player.y + y0, player.z - r, player.x + r, player.y + y1, player.z + r];
  const leaf = fl.add({
    preset: 'leaf', region: around(D.leaf.radius, D.leaf.scanY[0], D.leaf.scanY[1]),
    emit: (x, y, z) => { const id = world.getBlock(x, y, z); return leafIds.has(id) && world.getBlock(x, y - 1, z) === 0 ? { at: [x + rnd(), y - 0.05, z + rnd()], color: leafColor(id, x, z) } : null; },   // 树叶方块底面朝空气才掉
  });
  const bubble = fl.add({ preset: 'bubble', region: () => { const ex = player.x, ey = player.y + 1.6 - D.bubble.mouth, ez = player.z; return [ex - 0.15, ey - 0.15, ez - 0.15, ex + 0.15, ey + 0.15, ez + 0.15]; } });   // 嘴前
  const mote = fl.add({ preset: 'mote', region: () => { const r = D.mote.radius, h = D.mote.height, ey = player.y + 1.6; return [player.x - r, ey - h, player.z - r, player.x + r, ey + h, player.z + r]; } });

  gg.ambient = () => {   // 每帧：字典 + 面板 → set
    const fx = P.ambientFx ?? 1, under = !!player.headInWater, L = D.leaf;
    leaf.set({
      ...dyn('leaf'), region: around(L.radius, L.scanY[0], L.scanY[1]),
      rate: under ? 0 : L.rate * (P.leafRate ?? 1) * fx,
      size: L.size.map(v => v * (P.leafSize ?? 1)), fall: L.fall * (P.leafFall ?? 1), sway: L.sway * (P.leafSway ?? 1), tilt: L.tilt * (P.leafSway ?? 1),
    });
    bubble.set({ ...dyn('bubble'), rate: under ? D.bubble.rate * (P.bubbleRate ?? 1) * fx : 0, look: [P.bubbleHi ?? 0.3, P.bubbleAlpha ?? 0.45, P.bubbleRim ?? 0.5, 0] });
    mote.set({ ...dyn('mote'), rate: under ? D.mote.rate * (P.moteRate ?? 1) * fx : 0 });
  };
  return () => { leaf.remove({ kill: true }); bubble.remove({ kill: true }); mote.remove({ kill: true }); delete gg.ambient; delete gg.ambientParams; };
}
