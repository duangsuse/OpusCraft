// rgl/host-b.js —— 宿主 B（index.html + gls.js）→ rgl 的适配层：glsSource / glsBlocks / glsEnv + 方块 id 表 + 渲染器上下文。
// 宿主 B 的全部耦合只放在这里（宿主差异放表里，rgl 其余文件不写 if (host === …)）；接口形状见 goal-renderapi.ts §1–§3。
// 事件源不改宿主：包 Mesher.buildChunk（建好 / 重建 → 'blocks'）和 world.chunks.delete / clear（→ 'gone'）。
// 用法（index.html 的 Game.init）：?r=gl 时 import 本文件，createGlRenderer(gg, terrainGroup) → 得到 VR，主循环里 VR.update / VR.render。
import { SH } from '../vendor/gl/shared.js';

// 宿主 B 方块名 → goodGL 方块名。同名的不用写；goodGL 没有的两类：
//   ① 代用品（立方体类，画面上能区分即可；要真的话是给 SH 追加方块定义 + 贴图，供体补丁，见 render.md §3 ADD 行）
//   ② SPECIAL：goodGL 没有对应 RT 的模型（门 / 梯子 / 雪层 / 火），先当空气，R6-a 混合路径由宿主网格器画进实体合成
export const SUBST = {
  oxeye_daisy: 'daisy', lapis_ore: 'diamond_ore', emerald_ore: 'coal_ore',
  coal_block: 'smooth_basalt', iron_block: 'andesite', gold_block: 'yellow_terracotta', diamond_block: 'packed_ice', lapis_block: 'amethyst_block', emerald_block: 'mossy_stone_bricks',
  tnt: 'bricks', pumpkin: 'orange_terracotta', jack_o_lantern: 'lantern_block', spawner: 'mossy_cobblestone', netherrack: 'red_terracotta', end_stone: 'calcite',
  orange_wool: 'orange_terracotta', red_wool: 'red_terracotta', yellow_wool: 'yellow_terracotta', brown_wool: 'brown_terracotta', black_wool: 'obsidian',
  gray_wool: 'smooth_basalt', light_gray_wool: 'andesite', magenta_wool: 'amethyst_block', purple_wool: 'amethyst_block', pink_wool: 'red_sand',
  blue_wool: 'packed_ice', light_blue_wool: 'packed_ice', cyan_wool: 'packed_ice', green_wool: 'mossy_stone_bricks', lime_wool: 'mossy_stone_bricks',
};
export const SPECIAL = ['ladder', 'oak_door', 'snow', 'fire'];

/** 256 项：宿主 B id → goodGL id。没有同名也没有代用品的（物品类 id 不会出现在世界里）当石头 */
export function glid(Blocks) {
  const lut = new Uint8Array(256).fill(SH.BID.stone), miss = [];
  for (const b of Blocks.byId) {
    if (!b) continue;
    const n = SPECIAL.includes(b.name) || b.model === 'none' ? 'air' : SUBST[b.name] || b.name, g = SH.BID[n];
    if (g == null) { miss.push(b.name); continue; }
    lut[b.id] = g;
  }
  return { lut, miss };
}

const KIND = { none: 0, cube: 1, cross: 2, crop: 2, torch: 3, liquid: 4, fire: 2 };   // goal-renderapi.ts MODEL_TO_KIND；box / layer / ladder / door 先按整格（kind 7 以后）

export function glsBlocks(gg) {
  const { Blocks } = gg, n = 256;
  const kind = new Uint8Array(n), opaque = new Uint8Array(n), solid = new Uint8Array(n), occupied = new Uint8Array(n), cullSelf = new Uint8Array(n), tile = new Uint8Array(n);
  for (const b of Blocks.byId) {
    if (!b) continue;
    kind[b.id] = KIND[b.model] ?? 1; opaque[b.id] = b.opaque ? 1 : 0; solid[b.id] = b.solid ? 1 : 0;
    occupied[b.id] = kind[b.id] && kind[b.id] !== 4 ? 1 : 0; cullSelf[b.id] = b.model === 'cube' && b.transparent && b.cullSame ? 1 : 0;
  }
  return { kind, opaque, solid, occupied, cullSelf, tileTop: tile, tileBot: tile, tileSide: tile, waterId: gg.B.water, leavesId: gg.B.oak_leaves, tallGrassId: gg.B.short_grass };
}

export function glsSource(gg) {
  const { world, Mesher } = gg, H = gg.CHUNK_H, live = new Map(), revs = new Map(), cbs = [], key = (cx, cz) => cx + ',' + cz;
  let REV = 0;
  const emit = (cx, cz, what) => { if (what !== 'gone') revs.set(key(cx, cz), ++REV); for (const f of cbs) f(cx, cz, what); };
  const gone = c => { const k = key(c.cx, c.cz); if (live.get(k) === c) { live.delete(k); revs.delete(k); emit(c.cx, c.cz, 'gone'); } };
  const build = Mesher.buildChunk;
  Mesher.buildChunk = function (c) { const r = build.call(this, c); if (c.meshed) { live.set(key(c.cx, c.cz), c); emit(c.cx, c.cz, 'blocks'); } return r; };
  const del = world.chunks.delete.bind(world.chunks), clr = world.chunks.clear.bind(world.chunks);
  world.chunks.delete = k => { const c = world.chunks.get(k); if (c) gone(c); return del(k); };
  world.chunks.clear = () => { for (const c of [...world.chunks.values()]) gone(c); clr(); };
  for (const c of world.chunks.values()) if (c.meshed) { live.set(key(c.cx, c.cz), c); revs.set(key(c.cx, c.cz), ++REV); }   // 中途创建：接管已建区块
  return {
    size: 16, height: H,
    getBlocks(cx, cz) { const c = live.get(key(cx, cz)); return c && c.blocks; },
    getChunk(cx, cz) { const k = key(cx, cz), c = live.get(k); return c ? { blocks: c.blocks, meta: c.meta, sky: c.sky, blk: c.blk, biomes: c.biomes, rev: revs.get(k) } : null; },
    forEachChunk(fn) { for (const c of [...live.values()]) fn(c.cx, c.cz); },
    onChunkChanged(cb) { cbs.push(cb); },
  };
}

export function glsEnv(gg) {
  const { Sky, Weather, player, world, B } = gg, camera = gg.Game.camera, el = document.getElementById('water-tint');
  const eye = () => { const p = camera.position; return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)]; };
  return {
    get dayTime() { return Sky.time / gg.DAY_LENGTH; },                  // 0 = 06:00（Sky.update：theta = t·2π − π/2，alt = cos θ → t = 0 是日出）
    get weather() { return { rain: Weather.amount, thunder: Weather.storm, wet: Weather.amount }; },
    get flying() { return !!(player.flying || player.noclip); },
    get eyeInWater() { return !!player.headInWater; },
    get eyeSky() { const [x, y, z] = eye(); return world.getSky(x, y, z) / 15; },
    get eyeBlk() { const [x, y, z] = eye(); return world.getBlockLight(x, y, z) / 15; },
    get eyeWaterTop() {
      if (!player.headInWater) return undefined;
      const [x, y0, z] = eye(); let y = y0; while (y < gg.CHUNK_H && world.getBlock(x, y + 1, z) === B.water) y++;
      return y + 1 - 1 / 9;
    },
    get time() { return (performance.now() / 1000) % 3600; },
    underwater() { if (el && el.style.display !== 'none') el.style.display = 'none'; },   // 水下的蓝色 CSS 遮罩由着色器代替
  };
}

// goodGL 贴图名 → 宿主 Atlas 的贴图名。同名的不用写；表里没有（水 / 方块以外的东西）的保持 goodGL 自己的程序化贴图。
const PACK_NAME = { grass_top: 'grass_block_top', grass_side: 'grass_block_side', snowy_grass_side: 'grass_block_snow', furnace_front_lit: 'furnace_front_on', tall_grass: 'short_grass', daisy: 'oxeye_daisy', sandstone_side: 'sandstone', wool: 'white_wool', lava: 'lava_still' };
const packName = n => PACK_NAME[n] || (/^wheat_(\d)$/.test(n) ? 'wheat_stage' + n[6] : n);

/** 资源包 → goodGL 贴图：只覆盖资源包里真有的名字（Atlas.packImages），其余仍是程序化贴图（材质参数是和它们一起调的）。
 *  goodGL 的贴图阵列写死 16×16：高清包按块平均降到 16（会糊；要保留细节得改 vendor 的 uploadTextures / PBR，R7 以后）。 */
export function glsPack(gg) {
  const { Atlas } = gg;
  return tx => {
    if (!Atlas.packImages.size) return 0;
    const res = Atlas.tileRes, per = Atlas.tilesPerRow, g = Atlas.canvas.getContext('2d', { willReadFrequently: true }), S = SH.TEX_NAMES; let n = 0;
    for (let i = 0; i < S.length; i++) {
      const host = packName(S[i]); if (!Atlas.packImages.has(host)) continue;
      const k = Atlas.indexOf.get(host), src = g.getImageData((k % per) * res, Math.floor(k / per) * res, res, res).data, out = new Uint8ClampedArray(1024);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const x0 = Math.floor(x * res / 16), x1 = Math.max(x0 + 1, Math.floor((x + 1) * res / 16)), y0 = Math.floor(y * res / 16), y1 = Math.max(y0 + 1, Math.floor((y + 1) * res / 16));
        let r = 0, gg_ = 0, b = 0, a = 0, w = 0, c = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * res + xx) * 4, al = src[o + 3]; r += src[o] * al; gg_ += src[o + 1] * al; b += src[o + 2] * al; a += al; w += al; c++; }
        const o = (y * 16 + x) * 4; out[o] = w ? r / w : 0; out[o + 1] = w ? gg_ / w : 0; out[o + 2] = w ? b / w : 0; out[o + 3] = a / c;
      }
      if (S[i] === 'grass_top') for (let p = 3; p < 1024; p += 4) out[p] = 0;   // goodGL 的染色约定：tintMode 2 只染 alpha < 0.5 的像素；宿主 B 对草顶始终染色（包里的灰草），侧面不染（包自带绿边）
      tx.imgs[i] = out; tx.data.set(out, i * 1024); n++;
    }
    return n;
  };
}

/** index.html 的入口：建 ctx → 动态 import rgl → createRenderer。terrain = 宿主区块网格的容器（ChunkManager.scene 已指向它） */
export async function createGlRenderer(gg, terrain) {
  const { Game, Blocks, world, Mobs, Entities } = gg, { lut, miss } = glid(Blocks);
  if (miss.length) console.warn('rgl/host-b: goodGL 没有也没有代用品的方块（当石头）:', miss.join(' '));
  const SOLID = Uint8Array.from({ length: 256 }, (_, i) => Blocks.byId[i] && Blocks.byId[i].solid ? 1 : 0);
  Game.renderer.autoClear = false;   // 主循环 renderer.clear() 之后 VR.render()；three 画实体时不能再清掉 goodGL 的画面
  const ctx = {
    THREE: gg.THREE, scene: Game.scene, camera: Game.camera, renderer: Game.renderer,
    settings: { get rd() { return gg.ChunkManager.renderDistance; }, get fov() { return Game.camera.fov; } },
    source: glsSource(gg), blockTable: glsBlocks(gg), env: glsEnv(gg), glid: lut, texturePack: glsPack(gg),
    SOLID, getBlock: (x, y, z) => world.getBlock(x, y, z),
    get sky() { return gg.Sky.group; },   // 宿主的天空组（天球 / 日 / 月 / 星）：goodGL 自己画，这里每帧隐藏。区块网格不隐藏：Mesher.only 之后里面只剩特殊模型，要进实体合成
    get shadowCasters() {
      const o = [], sk = e => world.getSky(Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z));
      for (const m of Mobs.list) if (!m.dead) o.push({ x: m.x, y: m.y, z: m.z, r: m.w, sky: sk(m) });
      for (const e of Entities.list) if (e.kind === 'item' || e.kind === 'tnt') o.push({ x: e.x, y: e.y, z: e.z, r: Math.max(e.w, 0.2), sky: sk(e) });
      return o;
    },
  };
  const { createRenderer } = await import('./index.js');
  const vr = createRenderer(ctx), build = gg.Atlas.build;
  gg.Atlas.build = function () { const r = build.apply(this, arguments); vr.reloadTextures(); return r; };   // 资源包加载 / 卸载都会重画 Atlas
  return vr;
}
