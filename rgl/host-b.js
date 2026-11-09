// rgl/host-b.js —— 宿主 B（index.html + gls.js）→ rgl 的适配层：glsSource / glsBlocks / glsEnv / glsTextures + 方块 id 表 + 渲染器上下文。
// 宿主 B 的全部耦合只放在这里（宿主差异放表里，rgl 其余文件不写 if (host === …)）；接口形状见 goal-renderapi.ts §1–§3。
// 事件源不改宿主：包 Mesher.buildChunk（建好 / 重建 → 'blocks'）和 world.chunks.delete / clear（→ 'gone'）。
// 用法（index.html 的 Game.init）：?r=gl 时 import 本文件，createGlRenderer(gg, terrainGroup) → 得到 VR，主循环里 VR.update / VR.render。
import { SH } from '../vendor/gl/shared.js';

// 宿主 B 方块名 → goodGL 方块名。同名的不用写；goodGL 没有的两类：
//   ① 代用品（立方体类，画面上能区分即可；要真的话是给 SH 追加方块定义 + 贴图，供体补丁，见 render.md §3 ADD 行）
//   ② SPECIAL：goodGL 没有对应 RT 的模型（门 / 梯子 / 雪层 / 火），当空气（rgl 与宿主网格器互相独立，宿主在 gl 下不出几何）；火由 rgl/fire.js 按火方块摆火苗，其余待 rgl 自己实现
export const SUBST = {
  oxeye_daisy: 'daisy', lapis_ore: 'diamond_ore', emerald_ore: 'coal_ore',
  coal_block: 'smooth_basalt', iron_block: 'andesite', gold_block: 'yellow_terracotta', diamond_block: 'packed_ice', lapis_block: 'amethyst_block', emerald_block: 'mossy_stone_bricks',
  snow: 'snow_layer', tnt: 'bricks', pumpkin: 'orange_terracotta', jack_o_lantern: 'lantern_block', spawner: 'mossy_cobblestone', netherrack: 'red_terracotta', end_stone: 'calcite',
  orange_wool: 'orange_terracotta', red_wool: 'red_terracotta', yellow_wool: 'yellow_terracotta', brown_wool: 'brown_terracotta', black_wool: 'obsidian',
  gray_wool: 'smooth_basalt', light_gray_wool: 'andesite', magenta_wool: 'amethyst_block', purple_wool: 'amethyst_block', pink_wool: 'red_sand',
  blue_wool: 'packed_ice', light_blue_wool: 'packed_ice', cyan_wool: 'packed_ice', green_wool: 'mossy_stone_bricks', lime_wool: 'mossy_stone_bricks',
};
export const SPECIAL = ['fire'];

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
  const emissive = new Uint8Array(n);   // 自发光 0..15（岩浆 / 火把 / 火…）：rgl/fire.js 按它认岩浆和火焰；宿主 B 的方块定义里叫 light
  const kind = new Uint8Array(n), opaque = new Uint8Array(n), solid = new Uint8Array(n), occupied = new Uint8Array(n), cullSelf = new Uint8Array(n), tile = new Uint8Array(n);
  for (const b of Blocks.byId) {
    if (!b) continue;
    emissive[b.id] = Math.min(15, b.light | 0);
    kind[b.id] = KIND[b.model] ?? 1; opaque[b.id] = b.opaque ? 1 : 0; solid[b.id] = b.solid ? 1 : 0;
    occupied[b.id] = kind[b.id] && kind[b.id] !== 4 ? 1 : 0; cullSelf[b.id] = b.model === 'cube' && b.transparent && b.cullSame ? 1 : 0;
  }
  return { kind, emissive, opaque, solid, occupied, cullSelf, tileTop: tile, tileBot: tile, tileSide: tile, waterId: gg.B.water, leavesId: gg.B.oak_leaves, tallGrassId: gg.B.short_grass };
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
    // 单格变化：宿主的 blockChanged 事件（含流体 tick 改水位）。第 4 个参数 = { oldId, id, oldMeta, meta }（rgl/index.js 的水波纹按水位差缩放）
    onBlockChanged(cb) { gg.Events.on('blockChanged', (x, y, z, oldId, id, oldMeta, meta) => cb(x, y, z, { oldId, id, oldMeta, meta })); },
  };
}

export function glsEnv(gg) {
  const { Sky, Weather, player, world, B } = gg, camera = gg.Game.camera, el = document.getElementById('water-tint');
  const eye = () => { const p = camera.position; return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)]; };
  return {
    get dayTime() { return Sky.time / gg.DAY_LENGTH; },                  // 0 = 06:00（Sky.update：theta = t·2π − π/2，alt = cos θ → t = 0 是日出）
    get weather() { return { rain: Weather.amount, thunder: Weather.storm, wet: Weather.amount, flash: Weather.flash }; },
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

/** 资源包 → TextureSource（goal-renderapi.ts §2b，labPBR）：albedo 取 Atlas 画布上该格（已是包分辨率 Atlas.tileRes），_n / _s 取 ResourcePack.maps；
 *  只给包里真有的名字（其余 null = rgl 自带 procgen）。缩放、goodGL 的染色约定（草顶 α）、POM 深度表、HD 阵列都在 rgl/texpack.js。
 *  天空：宿主默认全景（defaultHdr，最低）< ResourcePack.sky（sun / moon_phases / pano*.hdr）< addHdr 的额外全景，+ properties → sky；HDR 异步解码（three/addons/loaders/HDRLoader.js），解码完推 onChange('sky')。 */
export function glsTextures(gg) {
  const { Atlas, ResourcePack: RP, Events, THREE } = gg, cbs = [], fire = what => { for (const f of cbs) f(what); };
  // 原值读回：canvas 2D 存的是预乘 alpha，_n.A（高度）/ _s.A（自发光）小的纹素 RGB 会被抹掉 → 用一个 WebGL2 小上下文 texImage2D + readPixels（不预乘、不转色彩空间）
  let rgl2 = null;
  const raw = img => {
    const gl = rgl2 ||= new OffscreenCanvas(1, 1).getContext('webgl2'), w = img.width, h = img.height, t = gl.createTexture(), fb = gl.createFramebuffer(), data = new Uint8ClampedArray(w * h * 4);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);   // 行 0 = 第一行上传的 = 图的顶行
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(t);
    return { w, h, data };
  };
  const pixels = (img, res) => {   // 第 0 帧（竖条动画），最近邻缩放到 res
    const r = raw(img), fh = r.h > r.w && r.h % r.w === 0 ? r.w : r.h, out = new Uint8ClampedArray(res * res * 4);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) { const o = (Math.floor(y * fh / res) * r.w + Math.floor(x * r.w / res)) * 4; out.set(r.data.subarray(o, o + 4), (y * res + x) * 4); }
    return out;
  };
  const whole = raw;
  const pano = new WeakMap();   // ArrayBuffer → Pano（同一份数据不重复解码）
  let sky = null, skyJob = 0;
  const flag = (v, d = true) => v == null ? d : !/^(false|0|off|no)$/i.test(String(v).trim());
  async function decodeSky() {
    const job = ++skyJob, hdr = new Map([...RP.defaultHdr, ...RP.sky.hdr, ...RP.extraHdr]), P = RP.props || {};
    const base = { sun: RP.sky.sun ? whole(RP.sky.sun) : null, moon: RP.sky.moon ? whole(RP.sky.moon) : null, show: { sun: flag(P.sun), moon: flag(P.moon), sky: flag(P.sky), stars: flag(P.stars) }, day: [], night: [], timed: false };
    if (hdr.size) {
      let Loader;
      try { ({ HDRLoader: Loader } = await import('three/addons/loaders/HDRLoader.js')); }
      catch (e) { console.warn('rgl/host-b: HDRLoader 不可用，退回 RGBELoader', e); ({ RGBELoader: Loader } = await import('three/addons/loaders/RGBELoader.js')); }
      const ld = new Loader(); ld.setDataType(THREE.HalfFloatType);
      const half = THREE.DataUtils.fromHalfFloat, list = { day: [], night: [] };
      for (const [k, buf] of hdr) {
        let p = pano.get(buf);
        if (!p) {
          const t = ld.parse(buf), d = t.data, w = t.width, h = t.height; let sum = 0, n = 0;
          for (let y = 0; y < h >> 1; y += Math.max(1, h >> 7)) for (let x = 0; x < w; x += Math.max(1, w >> 8)) { const o = (y * w + x) * 4; sum += 0.2126 * half(d[o]) + 0.7152 * half(d[o + 1]) + 0.0722 * half(d[o + 2]); n++; }
          p = { w, h, data: d, mean: Math.max(1e-6, sum / n) }; pano.set(buf, p);
        }
        const m = k.match(/^pano(_night)?([1-9]?)$/); (m[1] ? list.night : list.day).push({ i: +(m[2] || 0), p });
        if (m[2]) base.timed = true;
        if (job !== skyJob) return;   // 解码期间又换了包 / 拖入了新的：以新的为准
      }
      for (const k of ['day', 'night']) base[k] = list[k].sort((a, b) => a.i - b.i).map(e => e.p);
    }
    sky = base; src.version++; fire('sky');
  }
  const src = {
    version: 0,
    get res() { return Atlas.packImages.size ? Atlas.tileRes : 16; },
    get name() { return RP.loaded ? RP.name : ''; },
    get props() { return RP.props || {}; },
    get sky() { return sky; },
    get(name) {
      const host = packName(name), alb = Atlas.packImages.has(host), mp = RP.maps.get(host);
      if (!alb && !mp) return null;
      const res = this.res, L = {};
      if (alb) { const k = Atlas.indexOf.get(host), per = Atlas.tilesPerRow; L.albedo = Atlas.canvas.getContext('2d', { willReadFrequently: true }).getImageData((k % per) * res, Math.floor(k / per) * res, res, res).data; }
      if (mp && mp.n) L.normal = pixels(mp.n, res);
      if (mp && mp.s) L.specular = pixels(mp.s, res);
      return L;
    },
    onChange(cb) { cbs.push(cb); },
  };
  const redoSky = () => decodeSky().catch(e => console.warn('rgl/host-b: 天空资产解码失败', e));
  Events.on('atlasRebuilt', () => { src.version++; fire('blocks'); redoSky(); });   // ResourcePack.load / unload → Atlas.build（maps / sky / props 已就位）
  Events.on('resourcePackSky', redoSky);                                            // ?pano= / 拖入 .hdr
  redoSky();
  return src;
}

/** index.html 的入口：建 ctx → 动态 import rgl → createRenderer。terrain = 宿主区块网格的容器（ChunkManager.scene 已指向它） */
export async function createGlRenderer(gg, terrain) {
  const { Game, Blocks, world, Mobs, Entities } = gg, { lut, miss } = glid(Blocks);
  if (miss.length) console.warn('rgl/host-b: goodGL 没有也没有代用品的方块（当石头）:', miss.join(' '));
  const SOLID = Uint8Array.from({ length: 256 }, (_, i) => Blocks.byId[i] && Blocks.byId[i].solid ? 1 : 0);
  Game.renderer.autoClear = false;   // 主循环 renderer.clear() 之后 VR.render()；three 画实体时不能再清掉 goodGL 的画面
  const ctx = {
    THREE: gg.THREE, scene: Game.scene, camera: Game.camera, renderer: Game.renderer,
    settings: { get rd() { return gg.ChunkManager.renderDistance; }, get fogEdge() { return Math.min(1, (gg.rndr?.fogA1 ?? 0.576) / 0.576); }, get fov() { return Game.camera.fov; } },
    source: glsSource(gg), blockTable: glsBlocks(gg), env: glsEnv(gg), glid: lut, textures: glsTextures(gg),
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
  return createRenderer(ctx);   // 资源包加载 / 卸载 / 拖入：ctx.textures.onChange 驱动重建（rgl/index.js）
}
