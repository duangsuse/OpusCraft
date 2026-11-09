/* gode/w/slicer.js —— 生成器 Worker 的引擎运行时（s01 §2 信封、s02 §2 契约）。
   生成器脚本本身就是 Worker 入口：import 本文件，导出动词函数，末尾一行 serve(import.meta.url)。
     main → worker  { onkwarg: {seed, g, kw} }  { gen: {cx, cz}, id }  { sample: {x, z}, id } …
     worker → main  { ready: {meta} }           { gen: {cx, cz, blocks, biomes, heights, outside, ms}, id }  { err: {msg, stack}, id }
   分派：for (k in msg) → 生成器模块导出的同名函数；没导出的查引擎默认动词（ENGINE），都没有就忽略（广播事件无 id 不应答）。
   gen 的 out 由运行时分配（规范 YZX u16，s02 §1）；生成器用自己的布局时声明 meta.layout，并把 out.blocks（及 out.meta）
   换成原生数组，由 xlate 转换。V1 有 onkwarg / gen / sample / col（列级地表，引擎默认实现）；M1 加 gen 的 light（初始光照，gen 请求带 light:true 才算）与 mesh 动词；map 留给 M4。 */

export const H = 256, VOL = 65536;
const isWorker = typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined';

let mod = null, meta = null;          // 生成器模块命名空间、它的 meta（onkwarg 之后定）
let mb = null;                        // meshSection 的三个 MeshBuilder（不透明 / 半透明 / 植物），每个 worker 一套
let gtab = null, glMod = null, lightMod = null;   // 名字 → goodGL id / 光照属性表（glid.js）与 initLight（light.js）：gen 请求 light 时才加载
const queue = [];                     // serve() 完成前收到的消息

// 规范区块缓冲（gen 的 out）
export function chunkOut() { return { blocks: new Uint16Array(VOL), biomes: new Uint8Array(256), heights: new Int16Array(256) }; }

// 布局转换：原生 → 规范 YZX u16。支持 'yzx16'（不动）与 'xzy8'（宿主 B：x<<11|z<<7|y，u8 id + u8 meta，列数据 x 主序）
export function xlate(layout, out) {
  if (!layout || layout === 'yzx16') return out;
  if (layout === 'xzy8') {
    const id = out.blocks, mt = out.meta, nh = id.length >> 8, sh = Math.log2(nh);   // 原生高度（宿主 B 128）
    const b = new Uint16Array(VOL), bio = new Uint8Array(256), hs = new Int16Array(256);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const src = (x << (4 + sh)) | (z << sh), c = z * 16 + x;
      for (let y = 0; y < nh && y < H; y++) { const v = id[src | y]; if (v) b[(y << 8) | c] = v | (mt ? mt[src | y] << 12 : 0); }
      bio[c] = out.biomes[x * 16 + z]; hs[c] = out.heights[x * 16 + z];   // 列数组也是 x 主序（x*16+z）
    }
    return { ...out, blocks: b, biomes: bio, heights: hs, meta: undefined };
  }
  throw new Error('xlate: 未知布局 ' + layout);
}

// 最高非空气格（规范布局），-1 = 整列空
export function topOf(blocks, c) { let y = H - 1; while (y >= 0 && !blocks[(y << 8) | c]) y--; return y; }

/* 列级地表（pgviz 外圈 2D，s13 V-8）：每列 Int16×4 = [实体 type, 实体 y（-1 = 没有）, 群系, 水深]。
   cls = 方块分类（0 空气 1 实体 2 流体 3 植物，由 main 按名字算好随请求发来），植物跳过、流体计水深后继续往下。 */
export function colReduce(blocks, biomes, cls, out = new Int16Array(1024)) {
  for (let c = 0; c < 256; c++) {
    let t = 0, ty = -1, wd = 0;
    for (let y = H - 1; y >= 0; y--) {
      const v = blocks[(y << 8) | c]; if (!v) continue;
      const k = cls[v & 0xfff];
      if (k === 1) { t = v & 0xfff; ty = y; break; }
      if (k === 2) wd++;
    }
    out[c * 4] = t; out[c * 4 + 1] = ty; out[c * 4 + 2] = biomes[c]; out[c * 4 + 3] = wd;
  }
  return out;
}

// 引擎默认动词：生成器没导出时用
const ENGINE = {
  sample: () => null,
  // 场采样（pgviz 热力图，s13 V2）：x0,z0 起每 step 格取一点，n×n；返回每个数值字段一个 Float32Array（行主序 z 行 x 列），biome 不算
  async field({ x0, z0, n, step }) {
    const data = {};
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s = await mod.sample?.({ x: x0 + i * step, z: z0 + j * step });
      for (const k in s ?? {}) if (typeof s[k] === 'number' && k !== 'biome') (data[k] ??= new Float32Array(n * n))[j * n + i] = s[k];
    }
    return { x0, z0, n, step, data };
  },
  // 群系搜索（pgviz 群系 finder）：x0,z0 起每 step 格（取格中心 +step/2）采 n×n 个点，回 sample().biome 等于 want（id 或名字）的点 [x,z,x,z,…]
  async bfind({ x0, z0, n, step, want }) {
    const hits = [], h = step >> 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * step + h, z = z0 + j * step + h, b = (await mod.sample?.({ x, z }))?.biome;
      if (b !== undefined && (b === want.id || b === want.name)) hits.push(x, z);
    }
    return { x0, z0, n, step, hits: Int32Array.from(hits) };
  },
  // 默认实现 = 整块生成再归约（只回 2 KB）；生成器可导出更便宜的 col（只算列噪声）覆盖它
  async col({ cx, cz, cls }) {
    let out = chunkOut();
    await mod.gen({ cx, cz }, out);
    out = xlate(meta?.layout, out);
    return { cx, cz, col: colReduce(out.blocks, out.biomes, cls) };
  },
};

// 动词分派，返回 [应答键, 值, transfer]
async function run(k, arg) {
  if (k === 'onkwarg') {
    const r = (await mod.onkwarg?.(arg)) ?? {};
    meta = r.meta ?? mod.meta; gtab = null;   // 换生成器 / 热重置：光照属性表按新的 meta.names 重建
    return ['ready', { meta }];
  }
  if (k === 'gen') {
    const t0 = performance.now();
    let out = chunkOut();
    const r = (await mod.gen(arg, out)) ?? {};
    out = xlate(meta?.layout, out);
    const outside = r.outside instanceof Int32Array ? r.outside : Int32Array.from(r.outside ?? []);
    const v = { cx: arg.cx, cz: arg.cz, blocks: out.blocks, biomes: out.biomes, heights: out.heights, outside, ms: performance.now() - t0 };
    if (r.clip) v.clip = r.clip;   // liq：被 y 裁剪的格数（s02 §5）
    const tr = [out.blocks.buffer, out.biomes.buffer, out.heights.buffer, outside.buffer];
    if (arg.light) {   // 初始光照（s01 §4）：块内 BFS，边界外不看；ms 不含光照，另报 lms
      const t1 = performance.now();
      glMod ??= await import('./glid.js'); lightMod ??= (await import('./light.js')).initLight;
      gtab ??= glMod.glTable(meta?.names ?? []);
      v.light = lightMod(out.blocks, gtab); v.lms = performance.now() - t1; tr.push(v.light.buffer);
    }
    return ['gen', v, tr];
  }
  if (k === 'mesh') {   // 网格（M1-3，原 vendor/gl/pool.js 的 mesh）：main 拼好的 18³ padded（goodGL id）→ goodGL 顶点缓冲
    const { SH } = await import('../../vendor/gl/shared.js');
    mb ??= [new SH.MeshBuilder(16384), new SH.MeshBuilder(4096), new SH.MeshBuilder(4096)];
    const t0 = performance.now();
    const r = SH.meshSection(arg.pb, arg.pm, arg.pl, arg.tg, arg.tf, arg.wx, arg.wy, arg.wz, mb[0], mb[1], mb[2], arg.cls);
    r.ms = performance.now() - t0;
    return ['mesh', r, [r.opaque, r.trans, r.plant].filter(Boolean)];
  }
  const f = mod[k] ?? ENGINE[k];
  if (typeof f !== 'function') return null;
  return [k, await f(arg)];
}

async function onmsg(msg) {
  const id = msg.id;
  for (const k in msg) {
    if (k === 'id') continue;
    try {
      const r = await run(k, msg[k]);
      if (!r || (id === undefined && k !== 'onkwarg')) continue;   // 广播事件不应答（onkwarg 例外：总回 ready）
      const [rk, v, tr] = r;
      self.postMessage(id === undefined ? { [rk]: v } : { [rk]: v, id }, tr ?? []);
    } catch (e) {
      self.postMessage({ err: { msg: String(e?.message ?? e), stack: String(e?.stack ?? '') }, id });
    }
    break;   // 一条消息只有一个动词键
  }
}

if (isWorker) self.onmessage = (e) => mod ? onmsg(e.data) : queue.push(e.data);

/* 生成器末尾调用：serve(import.meta.url) —— 运行时再 import 一次自己（模块表里同一实例），拿到全部导出；
   也可以传对象 serve({ meta, onkwarg, gen, sample })。消息按到达顺序串行处理，保证 onkwarg 先于 gen。 */
export async function serve(m) {
  const ns = typeof m === 'string' ? await import(m) : m;
  if (!isWorker) return ns;   // node / 页面里 import 生成器做测试：不装消息循环
  let chain = Promise.resolve();
  const seq = (d) => (chain = chain.then(() => onmsg(d)));
  self.onmessage = (e) => seq(e.data);
  mod = ns;
  for (const d of queue.splice(0)) seq(d);
  return ns;
}
