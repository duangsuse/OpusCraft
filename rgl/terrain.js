// rgl/terrain.js —— 地形与阴影：宿主方块 → goodGL ID / 分类 → 区块网格调度，阴影图 pass，fancy / water 共用的 uniform 来源。由 xlate / blockclass / world / shaders/{shadow,common}.js 合并。
import { glsl, Fps, Fpv, named } from './pass.js';
import { SH } from '../vendor/gl/shared.js';
import { WorkerPool } from '../vendor/gl/pool.js';

// ======== xlate.js ========
// 宿主 → goodGL 的转换层（layout.md §2 的 GLID / padded）。宿主差异只放在表里，别处不写 if (host === …)。

// 宿主 A（VoxelCraft.html，B.* 26 个）→ goodGL 方块名。ids 按 B 的键名查，不写数字。
//   ⚠ TNT / GOLD_BLOCK：goodGL 没有（render.md §3 的 ADD 行：要给 SH 追加方块定义和贴图，属于供体补丁，R3 先不做）。
//   暂代：TNT → bricks（红砖）、GOLD_BLOCK → yellow_terracotta（黄色），画面上能区分即可；cls 是以后阴影分类用的（render.md §4.2）
export const GLID_A = {
  AIR: 'air', GRASS: 'grass_block', DIRT: 'dirt', STONE: 'stone', COBBLE: 'cobblestone', LOG: 'oak_log', LEAVES: 'oak_leaves', PLANKS: 'oak_planks',
  SAND: 'sand', WATER: 'water', COAL_ORE: 'coal_ore', IRON_ORE: 'iron_ore', GOLD_ORE: 'gold_ore', DIAMOND_ORE: 'diamond_ore', BEDROCK: 'bedrock',
  GLASS: 'glass', TABLE: 'crafting_table', FURNACE: 'furnace', TORCH: 'torch', TALL_GRASS: 'short_grass', POPPY: 'poppy', DANDELION: 'dandelion',
  SNOW: 'snow_block', STONE_BRICKS: 'stone_bricks', TNT: 'bricks' /* 暂代 */, GOLD_BLOCK: 'yellow_terracotta' /* 暂代 */,
};

/** 宿主方块 id → goodGL id 的 256 项查找表。B = 宿主的 { 名字: id }；表里没有的 id 一律当石头（可见、不崩） */
export function idLUT(B, table = GLID_A) {
  const lut = new Uint8Array(256).fill(SH.BID.stone);
  for (const [k, id] of Object.entries(B)) {
    const name = table[k]; if (name == null) continue;
    const g = SH.BID[name]; if (g == null) throw new Error('GLID: goodGL 没有方块 ' + name);
    lut[id] = g;
  }
  return lut;
}

// 宿主区块布局：blocks[(lx*16+lz)*H + y]，sky / blk 各一个 0..15 的数组；goodGL padded：18³，p = (y+1)*324 + (z+1)*18 + (x+1)
// 区块缺失（邻块还没建）按 goodGL 的做法：石头 + 无光，把朝向它的面挡掉。y < 0 基岩，y ≥ H 空气 + 满天空光。
export function padded(source, lut, H, cx, cz, s) {
  const pb = new Uint8Array(5832), pm = new Uint8Array(5832), pl = new Uint8Array(5832);
  const y0 = s * 16, cs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(source.getChunk(cx + dx, cz + dz));
  const bedrock = SH.BID.bedrock;
  for (let z = -1; z <= 16; z++) {
    const czi = z < 0 ? 0 : z > 15 ? 2 : 1, lz = z & 15;
    for (let x = -1; x <= 16; x++) {
      const cxi = x < 0 ? 0 : x > 15 ? 2 : 1, lx = x & 15, ch = cs[czi * 3 + cxi];
      let p = (z + 1) * 18 + (x + 1);
      if (!ch) { for (let y = -1; y <= 16; y++, p += 324) { pb[p] = 1; pl[p] = 0; } continue; }
      const col = (lx * 16 + lz) * H, B = ch.blocks, S = ch.sky, K = ch.blk;
      for (let y = -1; y <= 16; y++, p += 324) {
        const wy = y0 + y;
        if (wy < 0) { pb[p] = bedrock; pl[p] = 0; continue; }
        if (wy >= H) { pb[p] = 0; pl[p] = 0xF0; continue; }
        pb[p] = lut[B[col + wy]]; pl[p] = (S[col + wy] << 4) | K[col + wy];
      }
    }
  }
  return { pb, pm, pl };
}

/** 段 s 里有没有方块（空段不用网格化） */
export function sectionHasBlocks(blocks, H, s) {
  const y0 = s * 16, y1 = Math.min(H, y0 + 16);
  for (let c = 0; c < 256; c++) { const o = c * H; for (let y = y0; y < y1; y++) if (blocks[o + y]) return true; }
  return false;
}

// ======== blockclass.js ========
// 方块分类（goodGL id 空间；render.md §4.2）。网格器、阴影、水、之后的实体合成都按这里的类别走，不再各处写 id 表。
//   不透明整块 / 树叶 / 植物（草、花）/ 镂空 / 半透明 / 液体。
//   阴影的规则（bench.md §7）：树叶进软阴影图；植物进锐阴影图；草不接收锐阴影，花接收（含自己的）。

const { RT, RT_CUBE, RT_CROSS, RT_CROP, RT_LIQUID, MAT, OCC, LEAVES, BID } = SH;
// 草类：矮、密、一片一片的，自遮挡会把整片草压黑；其余植物（花、树苗、蘑菇、甘蔗…）是单株，自遮挡才好看
const GRASS = ['short_grass', 'fern', 'dead_bush', 'wheat'].map(k => BID[k]).filter(id => id != null);
const GRASS_SET = new Set(GRASS);

export const isLiquid = id => RT[id] === RT_LIQUID;
export const isLeaf = id => !!LEAVES[id];
export const isPlant = id => RT[id] === RT_CROSS || RT[id] === RT_CROP;
export const isGrass = id => GRASS_SET.has(id);
export const isFlower = id => isPlant(id) && !isGrass(id);
export const isCutout = id => id !== 0 && MAT[id] === 1;
export const isTranslucent = id => MAT[id] >= 2 && !isLiquid(id);
export const isOpaqueCube = id => RT[id] === RT_CUBE && !!OCC[id] && MAT[id] === 0;

// 阴影类别：'soft' 进软阴影图 / 'sharp' 进锐阴影图 / null 不投影（液体、半透明）
export const shadowClass = id => id === 0 || isLiquid(id) || isTranslucent(id) ? null : isPlant(id) ? 'sharp' : 'soft';

// 顶点 flags 的额外位（meshSection 的 CLS 参数）：8192 = 不接收锐阴影（草）；16384 = 花
export const NO_SHARP = 8192, FLOWER = 16384;   // FLOWER：着色器里花的高度明暗（体积感）
export function flagTable() {
  const t = new Uint16Array(256);
  for (let id = 1; id < 256; id++) { if (isGrass(id)) t[id] |= NO_SHARP; else if (isFlower(id)) t[id] |= FLOWER; }
  // 额外位不得与供体 FLAGS 的位重叠（256 = 岩浆 UV 滚动、512 / 1024 / 2048 / 4096 在着色器里另有用途）；曾经因常量写错让花贴图随时间上飘
  for (let id = 0; id < 256; id++) if (t[id] & ~(NO_SHARP | FLOWER) || (t[id] & SH.FLAGS[id])) throw new Error('blockclass: flags 位冲突 id=' + id);
  if ((NO_SHARP & 8191) || (FLOWER & 16383) || NO_SHARP === FLOWER) throw new Error('blockclass: NO_SHARP / FLOWER 必须是 8192 / 16384');
  return t;
}

// ======== world.js ========
// 区块记录 + 脏段调度 + Worker 网格化 + 上传（goodGL World.collectMeshJobs L2274 的宿主版）
//   宿主 A 只会发「某区块 blocks 变了 / 没了」（voxelCraftSource 把 buildChunk 一律映射成 'blocks'），所以
//   - 新区块：自己和 8 个邻居的段都要重网格化（AO / 平滑光照读邻格）；重建：自己 + 4 个边邻居
//   - 一个区块的 3×3 邻居都有了才网格化（同 goodGL 的 neighborsAtLeast），否则初始加载每块要被重做好几遍

const ST_LIT = 3;                          // R.cull 只看 state >= ST_LIT
const key = (cx, cz) => cx + ',' + cz;

// 宿主 A 没有群系：整块用平原的草 / 叶色（MC 平原 0x91bd59 / 0x77ab2f）。tint 数组是 256 列 × RGB，goodGL 的 meshSection 按列取
export function createWorld(R, source, lut, { seed = 1, grass = [0x91, 0xbd, 0x59], foliage = [0x77, 0xab, 0x2f] } = {}) {
  const H = source.height, NS = H >> 4;
  const pool = new WorkerPool(seed);
  const tG = new Uint8Array(768), tF = new Uint8Array(768);
  for (let c = 0; c < 256; c++) for (let k = 0; k < 3; k++) { tG[c * 3 + k] = grass[k]; tF[c * 3 + k] = foliage[k]; }   // render.md §3 的 tint 行：宿主 A = 常量
  const CLS = flagTable();                    // meshSection 的 CLS：草 = 不接收锐阴影（blockclass.js）
  const recs = new Map(); let inflight = 0, meshMs = 0, meshN = 0, quads = 0;

  const rec = (cx, cz) => {
    let r = recs.get(key(cx, cz));
    if (!r) { r = { cx, cz, state: ST_LIT, secCount: new Uint8Array(16), sections: Array.from({ length: 16 }, () => ({ dirty: false, pending: false, ver: 0, opaque: null, trans: null, meshed: false })) }; recs.set(key(cx, cz), r); }
    return r;
  };
  const markAll = (r) => { for (let s = 0; s < NS; s++) { const sec = r.sections[s]; if (r.secCount[s]) sec.dirty = true; else if (sec.meshed) { R.uploadSection(r, s, { opaque: null, on: 0, trans: null, tn: 0, plant: null, pn: 0 }); sec.meshed = false; sec.dirty = false; } } };
  const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]], NB4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const markNeighbors = (cx, cz, list) => { for (const [dx, dz] of list) { const r = recs.get(key(cx + dx, cz + dz)); if (r) markAll(r); } };

  // 宿主事件：blocks = 建好 / 重建；gone = 卸载
  source.onChunkChanged((cx, cz, what) => {
    if (what === 'gone') {
      const r = recs.get(key(cx, cz)); if (r) { R.freeChunk(r); recs.delete(key(cx, cz)); }
      markNeighbors(cx, cz, NB8); return;
    }
    const fresh = !recs.has(key(cx, cz)), r = rec(cx, cz), ch = source.getChunk(cx, cz);
    if (!ch) return;
    for (let s = 0; s < NS; s++) r.secCount[s] = sectionHasBlocks(ch.blocks, H, s) ? 1 : 0;
    markAll(r); markNeighbors(cx, cz, fresh ? NB8 : NB4);
  });
  // 接管已经存在的区块（渲染器中途创建 / 热切换）
  source.forEachChunk((cx, cz) => { const ch = source.getChunk(cx, cz); if (!ch) return; const r = rec(cx, cz); for (let s = 0; s < NS; s++) r.secCount[s] = sectionHasBlocks(ch.blocks, H, s) ? 1 : 0; markAll(r); });

  const ready = (r) => { for (const [dx, dz] of NB8) if (!recs.has(key(r.cx + dx, r.cz + dz))) return false; return true; };

  /** 每帧：从离相机最近的区块开始提交脏段（最多 maxJobs 个），Worker 回包后上传 */
  function pump(px, py, pz, rd, maxJobs) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4, lim = (rd + 0.5) ** 2, ps = Math.floor(py) >> 4;
    const todo = [];
    for (const r of recs.values()) {
      const d2 = (r.cx - pcx) ** 2 + (r.cz - pcz) ** 2; if (d2 > lim) continue;
      let any = false; for (let s = 0; s < NS; s++) if (r.sections[s].dirty && !r.sections[s].pending) { any = true; break; }
      if (any) todo.push([d2, r]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    let jobs = 0;
    for (const [, r] of todo) {
      if (jobs >= maxJobs) break;
      if (!ready(r)) continue;
      const order = []; for (let s = 0; s < NS; s++) order.push(s); order.sort((a, b) => Math.abs(a - ps) - Math.abs(b - ps));
      for (const s of order) {
        const sec = r.sections[s]; if (!sec.dirty || sec.pending) continue;
        sec.dirty = false;
        if (!r.secCount[s]) { R.uploadSection(r, s, { opaque: null, on: 0, trans: null, tn: 0, plant: null, pn: 0 }); sec.meshed = false; continue; }
        const { pb, pm, pl } = padded(source, lut, H, r.cx, r.cz, s);
        sec.pending = true; const ver = ++sec.ver, t0 = performance.now(); inflight++;
        pool.submit({ type: 'mesh', pb, pm, pl, tg: tG, tf: tF, cls: CLS, wx: r.cx * 16, wy: s * 16, wz: r.cz * 16 }, [pb.buffer, pm.buffer, pl.buffer], (res) => {
          inflight--; sec.pending = false; meshMs += performance.now() - t0; meshN++;
          if (ver !== sec.ver || recs.get(key(r.cx, r.cz)) !== r) return;       // 过期结果（段又脏了 / 区块没了）
          quads += ((res.on || 0) + (res.tn || 0) + (res.pn || 0)) >> 2; R.uploadSection(r, s, res);
        });
        if (++jobs >= maxJobs) break;
      }
    }
    if (pool.local) pool.pumpLocal(6);
    return jobs;
  }
  // 未完成的工作：在途 + 已经可以提交的脏段（bench 的 settle 等它归零；卡在环边缘、邻居永远不全的区块不算）
  function pending() {
    let n = inflight;
    for (const r of recs.values()) { if (!ready(r)) continue; for (let s = 0; s < NS; s++) { const sec = r.sections[s]; if (sec.dirty || sec.pending) n++; } }
    return n;
  }
  const stat = () => ({ chunks: recs.size, inflight, meshN, meshMsAvg: meshN ? meshMs / meshN : 0, quads, mode: pool.mode });
  return { chunk: (cx, cz) => recs.get(key(cx, cz)), pump, pending, stat, pool, recs };
}

// ======== shadow.js ========
// rgl/shaders/shadow.js —— goodGL shadowFS + shadowVS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
// sharp = R3b 锐阴影图（植物）：同一份 VS，只是不做 df 扭曲、矩阵换成 Fpv.sharpMat（原先是对 VS 文本做 .replace 得到第二个 program，现在是宏）
export const shadow = (Pass, X = {}, sharp = false) => Pass({ tag: sharp ? 'shadowS' : 'shadow', vs: glsl`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_uvl;
layout(location=3) in vec4 a_tint;
out vec3 v_uv; flat out int v_flags;
void main(){
  vec3 p = a_pos; vec3 wp = p + ${X.origin};
  float wave = floor(a_tint.a*255.0+0.5);
  if (wave > 0.5 && ${wind => Fpv.waving ? 1 : 0} > 0.0) {
    float t = ${Fps.time};
    vec3 off = vec3(sin(t*1.6 + wp.x*0.55 + wp.z*0.3 + wp.y*0.4), 0.0, cos(t*1.25 + wp.z*0.6 + wp.x*0.25));
    off += 0.45*vec3(sin(t*3.3 + wp.x*1.7 + wp.y), 0.0, sin(t*2.9 + wp.z*1.9));
    float amp = wave < 1.5 ? 0.03 : 0.085;
    if (wave < 1.5) off.y = sin(t*2.1 + wp.x + wp.z) * 0.5;
    p += off * amp * ${wind => Fpv.waving ? 1 : 0};
  }
  vec4 sp = ${shadowMat => sharp ? Fpv.sharpMat : Fpv.shadowMat} * vec4(p + ${X.offset}, 1.0);
#if ${() => sharp}
  float df = 1.0;
#else
  float df = length(sp.xy) * 0.9 + 0.1;
#endif
  sp.xy /= df;
  gl_Position = sp;
  v_uv = vec3(a_uvl.xy / 256.0, a_uvl.z);
  v_flags = int(a_uvl.w + 0.5);
}` })`#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 v_uv; flat in int v_flags;
void main(){ if ((v_flags & 3) == 1) { if (texture(${X.atlas}, vec3(clamp(v_uv.xy, vec2(0.002), vec2(0.998)), v_uv.z)).a < 0.5) discard; } }`;

// ======== common.js ========
// rgl/shaders/common.js —— fancy / water（以及以后更多 program）共用的 uniform 来源：同名同来源，各 pass 的 `${X.xxx}` 引用同一个对象
//   fm.hand：画手时 fancy 用另一组值（光向 / 光色 / 视图投影、关阴影与 POM、不摆动）；同一个 program，只是 use() 前由 renderFancy 置位。
export function commonX(R, tex, T) {
  const fm = R.fm = { hand: false }, handCol = new Float32Array(3), raw = { texture: null, sampler: null, glslType: 'sampler2D' }, ONE4 = [1, 1, 1, 1];
  return named({
    viewProj: () => fm.hand ? Fpv.handProj : Fpv.viewProj,
    wind: () => fm.hand ? 0 : Fpv.waving ? 1 : 0,
    shadowRes: () => R.shadowRes,
    shadowRange: () => Fpv.shadowDist,
    lightDir: () => fm.hand ? Fpv.handLightDir : Fpv.lightDir,
    lightCol: () => { if (!fm.hand) return Fpv.lightCol; for (let i = 0; i < 3; i++) handCol[i] = Fpv.lightCol[i] * Fpv.handShadow; return handCol; },
    wet: () => Fpv.wet || 0,
    colorMul: () => ONE4,
    sharpRes: () => R.sharpRes,
    shadow: () => tex(R.shadowTex, 'sampler2DShadow'),
    shadowRaw: () => { raw.texture = R.shadowTex; raw.sampler = R.rawSampler; return raw; },      // 值带 sampler：Pass 绑它而不是 null
    sharp: () => tex(R.sharpTex, 'sampler2DShadow'),
    nrm: () => tex(R.nrmTex, 'sampler2DArray'),
    spec: () => tex(R.specTex, 'sampler2DArray'),
    rain: () => Fpv.rain || 0, flash: () => Fpv.flash || 0,
    sceneColor: () => tex(T().copyC), sceneDepth: () => tex(T().copyD),
    // 宏（pass.js：`#` 行里的 ${} 取值进编译缓存键；切换命中缓存，GLSL 里是常量，编译器折叠分支）
    shadowM: () => fm.hand ? 0 : 1, pbrM: () => Fpv.pbr === false ? 0 : 1, pomM: () => Fpv.pom === false || fm.hand ? 0 : 1, cloudShM: () => Fpv.clouds ? 1 : 0, underM: () => Fpv.underwater ? 1 : 0,
    res: () => [Fpv.w, Fpv.h],
  });
}
